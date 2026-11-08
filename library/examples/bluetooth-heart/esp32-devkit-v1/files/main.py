from machine import UART, Pin
import time

# the HC-05: the board's TX to its RXD, its TXD to the board's RX; connect the phone on its card
bt = UART(2, baudrate=9600, timeout=50)
led = Pin(15, Pin.OUT)

while True:
    line = bt.readline()
    if line:
        msg = line.decode().strip()
        if msg == 'on':
            led.on()
            bt.write('LED on\n')
        elif msg == 'off':
            led.off()
            bt.write('LED off\n')
