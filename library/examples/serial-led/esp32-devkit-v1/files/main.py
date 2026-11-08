from machine import UART, Pin
import time

# the USB-serial adapter: TX2 (GPIO 17) to its RXD, RX2 (GPIO 16) from its TXD
uart = UART(2, baudrate=9600, timeout=50)
led = Pin(15, Pin.OUT)
uart.write('Hello! Type on or off.\r\n')

while True:
    line = uart.readline()       # waits up to 50 ms for a line
    if line:
        text = line.decode().strip()
        if text == 'on':
            led.on()
        elif text == 'off':
            led.off()
        uart.write('LED %s\r\n' % ('on' if led.value() else 'off'))
