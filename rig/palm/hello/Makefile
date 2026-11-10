# Build inside the toolchain image (see ../build.sh).
CC = m68k-palmos-gcc
CFLAGS = -O2 -Wall
APP = hello
CREATOR = PsHi

$(APP).prc: $(APP) bin.stamp
	build-prc $(APP).prc "positron" $(CREATOR) $(APP) *.bin

$(APP): $(APP).c $(APP).h
	$(CC) $(CFLAGS) $(APP).c -o $(APP)

bin.stamp: $(APP).rcp $(APP).h
	rm -f *.bin
	pilrc -q $(APP).rcp
	touch bin.stamp

clean:
	rm -f $(APP) $(APP).prc *.bin bin.stamp
