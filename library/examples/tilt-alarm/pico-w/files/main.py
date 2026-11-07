from machine import I2C, Pin
import struct
import time

led = Pin(15, Pin.OUT)
i2c = I2C(0, sda=Pin(4), scl=Pin(5))
i2c.writeto_mem(0x68, 0x6B, b'\x00')     # wake the MPU6050 up (it starts asleep)
while True:
    x, y, z = struct.unpack('>hhh', i2c.readfrom_mem(0x68, 0x3B, 6))
    led.value(abs(x) > 5600 or abs(y) > 5600)   # more than 20°: 16384 × sin 20°
    time.sleep_ms(50)
