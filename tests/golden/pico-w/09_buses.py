# Buses with nothing wired
def t(label, f):
    try:
        print(label, repr(f()))
    except Exception as e:
        print(label, type(e).__name__ + ':', e)
from machine import I2C, SoftI2C, SPI, UART, Pin
i = I2C(0)
t('i2c', lambda: i)
t('i2c1', lambda: I2C(1))
t('scan', lambda: i.scan())
t('write', lambda: i.writeto(0x3C, b'\x00'))
t('mem', lambda: i.readfrom_mem(0x68, 0x75, 1))
t('soft', lambda: SoftI2C(scl=Pin(5), sda=Pin(4)).writeto(0x3C, b'\x00'))
t('bad scl', lambda: I2C(0, scl=Pin(4), sda=Pin(5)))
t('I2C(2)', lambda: I2C(2))
t('spi', lambda: SPI(0))
t('spi read', lambda: SPI(0).read(2))
t('uart write', lambda: UART(1).write('AT'))
t('uart read', lambda: UART(1).read())
t('UART(2)', lambda: UART(2))
