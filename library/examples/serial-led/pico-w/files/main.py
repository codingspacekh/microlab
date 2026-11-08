from machine import UART, Pin
import time

# the USB-serial adapter: GP0 to its RXD, GP1 from its TXD
uart = UART(0, baudrate=9600, tx=Pin(0), rx=Pin(1), timeout=50)
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
