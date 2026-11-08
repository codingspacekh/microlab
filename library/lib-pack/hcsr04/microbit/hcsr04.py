# hcsr04.py for the micro:bit (MicroLab): the calls of rsc1975's micropython-hcsr04, with the micro:bit's pin
# objects: HCSR04(trigger_pin=pin1, echo_pin=pin2). Bring the 5 V echo down to 3.3 V (1 k + 2 k divider).
# MIT License. Copyright (c) 2026 MicroLab. Permission is granted to use, copy, modify and share this file, with
# this notice, without warranty (the MIT licence, https://opensource.org/licenses/MIT).
from machine import time_pulse_us
import utime


class HCSR04:
    def __init__(self, trigger_pin, echo_pin, echo_timeout_us=30000):
        self.trigger, self.echo, self.echo_timeout_us = trigger_pin, echo_pin, echo_timeout_us
        self.trigger.write_digital(0)

    def _send_pulse_and_wait(self):
        self.trigger.write_digital(0)
        utime.sleep_us(5)
        self.trigger.write_digital(1)
        utime.sleep_us(10)
        self.trigger.write_digital(0)
        t = time_pulse_us(self.echo, 1, self.echo_timeout_us)
        if t < 0:
            raise OSError('Out of range')
        return t

    def distance_mm(self):
        return self._send_pulse_and_wait() * 100 // 582

    def distance_cm(self):
        return (self._send_pulse_and_wait() / 2) / 29.1
