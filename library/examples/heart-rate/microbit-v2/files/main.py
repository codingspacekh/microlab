from microbit import *
import utime as time

A = 0x57
def w(r, v):
    i2c.write(A, bytes([r, v]))
def rd(r, n=1):
    i2c.write(A, bytes([r]))
    return i2c.read(A, n)

w(0x09, 0x40)                           # reset
w(0x0A, 0x27)                           # SpO2: 100 samples a second, 18 bits
w(0x0C, 0x24); w(0x0D, 0x24)            # the red and IR LEDs' current
w(0x09, 0x03)                           # SpO2 mode: red and IR
red, ir = [], []
t0 = time.ticks_ms()
while time.ticks_diff(time.ticks_ms(), t0) < 6000:     # 6 s of samples
    n = (rd(0x04)[0] - rd(0x06)[0]) & 31               # how many are waiting
    for _ in range(n):
        d = rd(0x07, 6)
        red.append((d[0] << 16 | d[1] << 8 | d[2]) & 0x3FFFF)
        ir.append((d[3] << 16 | d[4] << 8 | d[5]) & 0x3FFFF)
    time.sleep_ms(50)
m, top = sum(ir) / len(ir), max(ir)
beats, up = 0, False
for v in ir:                            # a beat: up past half way to the top
    if not up and v > m + (top - m) / 2:
        beats, up = beats + 1, True
    elif up and v < m:
        up = False
def swing(x):
    return (max(x) - min(x)) / (sum(x) / len(x))
print('BPM:', beats * 10)               # beats in 6 s, times 10
print('SpO2:', round(110 - 25 * swing(red) / swing(ir)), '%')
