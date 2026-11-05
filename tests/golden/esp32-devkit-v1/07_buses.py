# Buses with nothing wired; time_pulse_us; file errors
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from machine import I2C, SPI, UART, Pin, time_pulse_us
i = I2C(0)
t('i2c', lambda: (i, I2C(1)))
t('scan', lambda: i.scan())
t('read', lambda: i.readfrom(0x3C, 2))
t('spi', lambda: (SPI(1), SPI(2)))
t('SPI(3)', lambda: SPI(3))
u = UART(2, 9600)
t('uart', lambda: (u.write('AT\r\n'), u.read(), u.any()))
t('UART(3)', lambda: UART(3))
p = Pin(4, Pin.IN, Pin.PULL_UP)
t('pulse', lambda: (time_pulse_us(p, 0, 10000), time_pulse_us(p, 1, 10000)))
t('missing', lambda: open('no-such-file.txt'))
