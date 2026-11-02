// Hand models in Rust with tract-onnx: outputs against TFLite references,
// timing, and the palm -> crop -> landmarks pipeline on a photo.
// Usage: handrs <onnx dir> <ref dir> <photo.jpg>
use std::time::Instant;
use tract_onnx::prelude::*;

type Plan = std::sync::Arc<TypedSimplePlan>;

fn load(path: &str, side: usize) -> TractResult<Plan> {
    tract_onnx::onnx()
        .model_for_path(path)?
        .with_input_fact(0, f32::fact([1, side, side, 3]).into())?
        .into_optimized()?
        .into_runnable()
}

fn read_f32(path: &str) -> Vec<f32> {
    let b = std::fs::read(path).unwrap_or_else(|e| panic!("{path}: {e}"));
    b.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect()
}

fn run(p: &Plan, x: &[f32], side: usize) -> TractResult<Vec<Vec<f32>>> {
    let t = tract_ndarray::Array4::from_shape_vec((1, side, side, 3), x.to_vec())?;
    let out = p.run(tvec!(Tensor::from(t).into()))?;
    Ok(out.iter().map(|o| o.to_plain_array_view::<f32>().unwrap().iter().copied().collect()).collect())
}

/// Largest difference from the references; each output is matched to the
/// same-size reference it is closest to, since output order may differ.
fn compare(outs: &[Vec<f32>], refs: &[Vec<f32>]) -> f32 {
    outs.iter().map(|o| {
        refs.iter().filter(|r| r.len() == o.len())
            .map(|r| o.iter().zip(r).map(|(a, b)| (a - b).abs()).fold(0f32, f32::max))
            .fold(f32::INFINITY, f32::min)
    }).fold(0f32, f32::max)
}

fn median_ms(p: &Plan, x: &[f32], side: usize) -> f64 {
    for _ in 0..3 { run(p, x, side).unwrap(); }
    let mut t: Vec<f64> = (0..30).map(|_| {
        let s = Instant::now(); run(p, x, side).unwrap(); s.elapsed().as_secs_f64() * 1e3
    }).collect();
    t.sort_by(|a, b| a.partial_cmp(b).unwrap());
    t[15]
}

fn anchors() -> Vec<(f32, f32)> {
    let mut a = Vec::with_capacity(2016);
    for (stride, n) in [(8usize, 2usize), (16, 6)] {
        let g = 192 / stride;
        for y in 0..g { for x in 0..g { for _ in 0..n {
            a.push(((x as f32 + 0.5) / g as f32, (y as f32 + 0.5) / g as f32));
        }}}
    }
    a
}

struct Rgb { w: usize, h: usize, px: Vec<f32> }

fn sample(im: &Rgb, x: f32, y: f32, c: usize) -> f32 {
    if x < 0.0 || y < 0.0 || x > (im.w - 1) as f32 || y > (im.h - 1) as f32 { return 0.0; }
    let (x0, y0) = (x.floor() as usize, y.floor() as usize);
    let (x1, y1) = ((x0 + 1).min(im.w - 1), (y0 + 1).min(im.h - 1));
    let (fx, fy) = (x - x0 as f32, y - y0 as f32);
    let p = |xx: usize, yy: usize| im.px[(yy * im.w + xx) * 3 + c];
    p(x0, y0) * (1. - fx) * (1. - fy) + p(x1, y0) * fx * (1. - fy) + p(x0, y1) * (1. - fx) * fy + p(x1, y1) * fx * fy
}

/// side x side input from the image through an affine map, crop pixel to image pixel.
fn warp(im: &Rgb, side: usize, m: [f32; 6]) -> Vec<f32> {
    let mut out = vec![0f32; side * side * 3];
    for v in 0..side { for u in 0..side {
        let (uf, vf) = (u as f32 + 0.5, v as f32 + 0.5);
        let x = m[0] * uf + m[1] * vf + m[2] - 0.5;
        let y = m[3] * uf + m[4] * vf + m[5] - 0.5;
        for c in 0..3 { out[(v * side + u) * 3 + c] = sample(im, x, y, c); }
    }}
    out
}

fn main() -> TractResult<()> {
    let a: Vec<String> = std::env::args().collect();
    let (dir, refd, photo) = (&a[1], &a[2], &a[3]);
    let xp = read_f32(&format!("{refd}/xp.f32"));
    let xl = read_f32(&format!("{refd}/xl.f32"));

    let mut full = None;
    for kind in ["lite", "full"] {
        let t0 = Instant::now();
        let palm = load(&format!("{dir}/palm_detection_{kind}.onnx"), 192)?;
        let lm = load(&format!("{dir}/hand_landmark_{kind}.onnx"), 224)?;
        let load_ms = t0.elapsed().as_secs_f64() * 1e3;
        let rp: Vec<Vec<f32>> = (0..2).map(|k| read_f32(&format!("{refd}/palm_detection_{kind}.out{k}.f32"))).collect();
        let rl: Vec<Vec<f32>> = (0..4).map(|k| read_f32(&format!("{refd}/hand_landmark_{kind}.out{k}.f32"))).collect();
        println!("{kind}  load and optimise both: {load_ms:.0} ms");
        println!("{kind}  max |diff| vs tflite: palm {:.2e}  landmark {:.2e}",
            compare(&run(&palm, &xp, 192)?, &rp), compare(&run(&lm, &xl, 224)?, &rl));
        println!("{kind}  median ms: palm {:.1}  landmark {:.1}", median_ms(&palm, &xp, 192), median_ms(&lm, &xl, 224));
        if kind == "full" { full = Some((palm, lm)); }
    }

    let img = image::open(photo).expect("photo").to_rgb8();
    let im = Rgb { w: img.width() as usize, h: img.height() as usize,
        px: img.as_raw().iter().map(|&b| b as f32 / 255.0).collect() };
    let (palm, lm) = full.unwrap();
    let s = 192.0 / im.w.max(im.h) as f32;
    let ox = ((192.0 - (im.w as f32 * s).round()) / 2.0).floor();
    let oy = ((192.0 - (im.h as f32 * s).round()) / 2.0).floor();
    let t0 = Instant::now();
    let inp = warp(&im, 192, [1. / s, 0., -ox / s, 0., 1. / s, -oy / s]);
    let outs = run(&palm, &inp, 192)?;
    let (reg, sc) = if outs[0].len() == 2016 * 18 { (&outs[0], &outs[1]) } else { (&outs[1], &outs[0]) };
    let anc = anchors();
    let (i, raw) = sc.iter().enumerate().fold((0, f32::MIN), |b, (i, &v)| if v > b.1 { (i, v) } else { b });
    let score = 1.0 / (1.0 + (-raw).exp());
    let r: Vec<f32> = reg[i * 18..i * 18 + 18].iter().map(|v| v / 192.0).collect();
    let back = |px: f32, py: f32| ((px * 192.0 - ox) / s, (py * 192.0 - oy) / s);
    let (cx, cy) = back(r[0] + anc[i].0, r[1] + anc[i].1);
    let (w, h) = (r[2] * 192.0 / s, r[3] * 192.0 / s);
    let kp: Vec<(f32, f32)> = (0..7).map(|k| back(r[4 + 2 * k] + anc[i].0, r[5 + 2 * k] + anc[i].1)).collect();
    let rot = std::f32::consts::FRAC_PI_2 - (-(kp[2].1 - kp[0].1)).atan2(kp[2].0 - kp[0].0);
    let size = w.max(h) * 2.6;
    let sy = -0.5 * w.max(h);
    let (bx, by) = (cx - sy * rot.sin(), cy + sy * rot.cos());
    let k = size / 224.0;
    let (ma, mb, md, me) = (k * rot.cos(), -k * rot.sin(), k * rot.sin(), k * rot.cos());
    let tx = bx - (ma * 112.0 + mb * 112.0);
    let ty = by - (md * 112.0 + me * 112.0);
    let crop = warp(&im, 224, [ma, mb, tx, md, me, ty]);
    let lo = run(&lm, &crop, 224)?;
    let pipe_ms = t0.elapsed().as_secs_f64() * 1e3;
    let pts = lo.iter().find(|o| o.len() == 63).unwrap();
    let pres: Vec<f32> = lo.iter().filter(|o| o.len() == 1).map(|o| (o[0] * 1000.).round() / 1000.).collect();
    let (ux, uy) = (pts[24], pts[25]);
    println!("photo  palm score {score:.3}  centre ({cx:.1},{cy:.1})  box ({bx:.1},{by:.1}) size {size:.1} rot {rot:.2}");
    println!("photo  presence/handedness {pres:?}  index tip ({:.1},{:.1})", ma * ux + mb * uy + tx, md * ux + me * uy + ty);
    println!("photo  whole pipeline incl. resampling: {pipe_ms:.1} ms");
    Ok(())
}
