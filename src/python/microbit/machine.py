# The micro:bit's machine module (modmachine.c, micropython-microbit-v2 v2.1.2) — the parts M2 needs.
import _bus


def time_pulse_us(pin, pulse_level, timeout_us=1000000):
    return _bus.time_pulse_us(pin._key, pulse_level, timeout_us)


def freq():
    return 64000000   # the nRF52833's 64 MHz
