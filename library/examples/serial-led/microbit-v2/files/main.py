from microbit import *

led = pin2
on = False
# the USB-serial adapter: P1 to its RXD, P0 from its TXD (print() goes out of P1 now)
uart.init(baudrate=9600, tx=pin1, rx=pin0)
uart.write('Hello! Type on or off.\r\n')

while True:
    if uart.any():
        sleep(10)                # the rest of the line on its way
        text = uart.read().decode().strip()
        if text in ('on', 'off'):
            on = text == 'on'    # kept here: read_digital() would make the pin an input
            led.write_digital(on)
        uart.write('LED %s\r\n' % ('on' if on else 'off'))
    sleep(10)
