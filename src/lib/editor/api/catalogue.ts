/**
 * The boards' MicroPython modules for autocomplete (F-20, screen 02b): every name with its signature as the
 * MicroPython docs give it (v1.29; the micro:bit's v2.1 docs) and one line a student can read. One line per name:
 *
 *   'Pin(id, mode=-1, pull=-1, *, value=None) — what it is'   a class (capital) or a function / method (with a dot)
 *   'Pin.OUT — …'                                             a constant (capitals)
 *   'display: Display — …'                                    an object; its members are the class's
 *   '~Display — …'                                            a class used only for objects: not offered itself
 *   '~TouchPin < AnalogPin — …'                               a class with everything another class has, and more
 *   '@pico @esp32 name …'                                     only on those boards (pico, esp32, microbit)
 *
 * tests/python/api.test.ts checks every name against the simulated board, both ways.
 */
export type ApiBoard = 'pico' | 'esp32' | 'microbit';

const MACHINE = `
@pico Pin(id, mode=-1, pull=-1, *, value=None, alt=-1) — A GPIO pin: an output to light an LED, or an input to read a button. Pin(15, Pin.OUT), Pin(14, Pin.IN, Pin.PULL_UP); the Pico W's own LED is Pin("LED", Pin.OUT).
@esp32 Pin(id, mode=-1, pull=-1, *, value=None, drive=-1) — A GPIO pin: an output to light an LED, or an input to read a button. Pin(2, Pin.OUT) is the blue LED on the board; Pin(14, Pin.IN, Pin.PULL_UP).
Pin.value(x=None) — Without a value: reads the pin, 0 or 1. With one: sets an output pin to 0 (off) or 1 (on).
Pin.on() — Sets an output pin to 1 (3.3 V): an LED from the pin to GND lights.
Pin.off() — Sets an output pin to 0 (0 V).
Pin.toggle() — Swaps an output pin: 1 becomes 0, 0 becomes 1.
@pico Pin.high() — Sets an output pin to 1, as on().
@pico Pin.low() — Sets an output pin to 0, as off().
Pin.init(mode=-1, pull=-1, *, value=None) — Sets the pin up again: its mode, its pull resistor, its first value.
Pin.irq(handler=None, trigger=Pin.IRQ_FALLING | Pin.IRQ_RISING, hard=False) — Calls handler(pin) the moment the pin changes, while the rest of the program runs.
Pin.IN — Mode: the pin reads what it is joined to (a button, a sensor).
Pin.OUT — Mode: the pin drives what it is joined to (an LED, a buzzer).
Pin.OPEN_DRAIN — Mode: the pin pulls down to 0 V or lets go, never drives to 3.3 V.
Pin.PULL_UP — Turns on the pin's own resistor to 3.3 V, so it reads 1 until a button joins it to GND and it reads 0. No resistor needed on the breadboard.
Pin.PULL_DOWN — Turns on the pin's own resistor to GND, so it reads 0 until a button joins it to 3.3 V.
Pin.IRQ_RISING — irq() trigger: when the pin goes from 0 to 1.
Pin.IRQ_FALLING — irq() trigger: when the pin goes from 1 to 0.
@pico Pin.ALT — Mode: the pin is used by another part of the chip (PWM, I2C, SPI, UART).
@pico Pin.ALT_SIO — alt: the pin is an ordinary GPIO.
@pico Pin.ALT_PWM — alt: the pin is driven by PWM.
@pico Pin.ALT_I2C — alt: the pin is used by I2C.
@pico Pin.ALT_SPI — alt: the pin is used by SPI.
@pico Pin.ALT_UART — alt: the pin is used by a UART.
@pico Pin.ALT_PIO0 — alt: the pin is used by PIO block 0.
@pico Pin.ALT_PIO1 — alt: the pin is used by PIO block 1.
@pico Pin.ALT_GPCK — alt: the pin outputs a clock.
@pico Pin.ALT_USB — alt: the pin is used by USB.
@esp32 Pin.WAKE_LOW — Wakes the ESP32 from sleep when the pin is 0.
@esp32 Pin.WAKE_HIGH — Wakes the ESP32 from sleep when the pin is 1.
@esp32 Pin.DRIVE_0 — The weakest output (about 5 mA).
@esp32 Pin.DRIVE_1 — A weak output (about 10 mA).
@esp32 Pin.DRIVE_2 — The usual output (about 20 mA).
@esp32 Pin.DRIVE_3 — The strongest output (about 40 mA).
@pico ADC(id) — Reads a voltage, 0–3.3 V, on GP26, GP27 or GP28: ADC(26) or ADC(Pin(26)).
@esp32 ADC(pin, *, atten=ADC.ATTN_0DB) — Reads a voltage on an analog pin: ADC(Pin(34)). Use atten=ADC.ATTN_11DB to read up to about 3.3 V.
ADC.read_u16() — The voltage as a number from 0 (0 V) to 65535 (3.3 V).
@pico ADC.CORE_TEMP — ADC(ADC.CORE_TEMP) reads the chip's own temperature sensor.
@esp32 ADC.read() — The voltage as a number from 0 to 4095.
@esp32 ADC.read_uv() — The voltage in microvolts (1 000 000 = 1 V).
@esp32 ADC.init(*, atten) — Sets the range again.
@esp32 ADC.atten(atten) — Sets how high a voltage it can read: ATTN_0DB about 1 V … ATTN_11DB about 3.3 V.
@esp32 ADC.width(bits) — Sets how many bits read() gives: ADC.WIDTH_9BIT … ADC.WIDTH_12BIT.
@esp32 ADC.ATTN_0DB — Range up to about 1 V.
@esp32 ADC.ATTN_2_5DB — Range up to about 1.3 V.
@esp32 ADC.ATTN_6DB — Range up to about 2 V.
@esp32 ADC.ATTN_11DB — Range up to about 3.3 V.
@esp32 ADC.WIDTH_9BIT — read() gives 0–511.
@esp32 ADC.WIDTH_10BIT — read() gives 0–1023.
@esp32 ADC.WIDTH_11BIT — read() gives 0–2047.
@esp32 ADC.WIDTH_12BIT — read() gives 0–4095.
PWM(dest, *, freq, duty_u16, duty_ns, invert) — Switches a pin on and off very fast: dims an LED, turns a servo, sounds a buzzer. PWM(Pin(15), freq=1000, duty_u16=32768).
PWM.freq(value=None) — How many times a second it switches (Hz); without a value, reads it.
PWM.duty_u16(value=None) — How long it stays on: 0 (never) to 65535 (always); without a value, reads it.
PWM.duty_ns(value=None) — How long it stays on each time, in nanoseconds (a servo: 500 000 to 2 500 000).
@esp32 PWM.duty(value=None) — How long it stays on: 0 to 1023 (the older way; duty_u16 is the same on every board).
PWM.init(*, freq, duty_u16, duty_ns) — Sets it up again.
PWM.deinit() — Stops it; the pin goes back to an ordinary pin.
Timer(id=-1) — Calls a function again and again, or once, while the rest of the program runs.
Timer.init(*, mode=Timer.PERIODIC, freq=-1, period=-1, callback=None) — Starts it: Timer().init(period=500, callback=blink) calls blink(t) every 500 ms.
Timer.deinit() — Stops it.
Timer.PERIODIC — mode: call the function again and again.
Timer.ONE_SHOT — mode: call the function once.
I2C(id, *, scl, sda, freq=400000) — A two-wire bus for sensors and displays (SCL and SDA); each device has its own address.
I2C.scan() — The addresses of every device that answers, e.g. [60] for a 0x3C display.
I2C.readfrom(addr, nbytes) — Reads nbytes bytes from the device.
I2C.readfrom_into(addr, buf) — Reads from the device into buf.
I2C.writeto(addr, buf) — Writes the bytes in buf to the device.
I2C.writevto(addr, vector) — Writes several buffers to the device, one after another.
I2C.readfrom_mem(addr, memaddr, nbytes) — Reads nbytes bytes from a register of the device.
I2C.readfrom_mem_into(addr, memaddr, buf) — Reads a register of the device into buf.
I2C.writeto_mem(addr, memaddr, buf) — Writes buf to a register of the device.
SoftI2C(scl, sda, *, freq=400000) — An I2C bus on any two pins, run by the processor.
SoftI2C.scan() — The addresses of every device that answers.
SoftI2C.readfrom(addr, nbytes) — Reads nbytes bytes from the device.
SoftI2C.readfrom_into(addr, buf) — Reads from the device into buf.
SoftI2C.writeto(addr, buf) — Writes the bytes in buf to the device.
SoftI2C.writevto(addr, vector) — Writes several buffers to the device, one after another.
SoftI2C.readfrom_mem(addr, memaddr, nbytes) — Reads nbytes bytes from a register of the device.
SoftI2C.readfrom_mem_into(addr, memaddr, buf) — Reads a register of the device into buf.
SoftI2C.writeto_mem(addr, memaddr, buf) — Writes buf to a register of the device.
SPI(id, baudrate=1000000, *, polarity=0, phase=0, bits=8, firstbit=SPI.MSB, sck, mosi, miso) — A fast bus for displays and SD cards (SCK, MOSI, MISO and a CS pin of your own).
SPI.read(nbytes, write=0x00) — Reads nbytes bytes, sending write each time.
SPI.readinto(buf, write=0x00) — Reads into buf, sending write each time.
SPI.write(buf) — Sends the bytes in buf.
SPI.write_readinto(write_buf, read_buf) — Sends write_buf and reads into read_buf at the same time.
SPI.deinit() — Stops the bus.
SPI.MSB — firstbit: the highest bit first (the usual way).
SPI.LSB — firstbit: the lowest bit first.
SoftSPI(baudrate=500000, *, polarity=0, phase=0, bits=8, firstbit=SoftSPI.MSB, sck, mosi, miso) — An SPI bus on any pins, run by the processor.
SoftSPI.read(nbytes, write=0x00) — Reads nbytes bytes, sending write each time.
SoftSPI.readinto(buf, write=0x00) — Reads into buf, sending write each time.
SoftSPI.write(buf) — Sends the bytes in buf.
SoftSPI.write_readinto(write_buf, read_buf) — Sends write_buf and reads into read_buf at the same time.
SoftSPI.deinit() — Stops the bus.
SoftSPI.MSB — firstbit: the highest bit first.
SoftSPI.LSB — firstbit: the lowest bit first.
UART(id, baudrate=115200, *, tx, rx, bits=8, parity=None, stop=1, timeout=0) — A serial link with another device (TX to its RX, RX to its TX, and GND).
UART.any() — How many bytes are waiting to be read.
UART.read(nbytes=None) — Reads the bytes waiting (or nbytes of them); None if there are none.
UART.readinto(buf) — Reads into buf.
UART.readline() — Reads up to the end of a line.
UART.write(buf) — Sends the bytes in buf.
UART.flush() — Waits until everything written has been sent.
UART.txdone() — True when everything written has been sent.
UART.deinit() — Stops the UART.
@esp32 DAC(pin) — A true analog output on GPIO25 or GPIO26: DAC(Pin(25)).
@esp32 DAC.write(value) — Sets the voltage: 0 (0 V) to 255 (3.3 V).
@esp32 TouchPad(pin) — Feels a finger on a touch pin: TouchPad(Pin(4)).
@esp32 TouchPad.read() — A number that drops when the pin is touched.
@esp32 TouchPad.config(value) — The level for waking the ESP32 by touch.
freq(hz=None) — The processor's speed in Hz; without a value, reads it.
time_pulse_us(pin, pulse_level, timeout_us=1000000) — How long, in µs, the pin stays at pulse_level (an HC-SR04's echo: 58 µs per cm).
bitstream(pin, encoding, timing, data) — Sends bits with exact timing (NeoPixels use it).
`;

const MICROBIT_MACHINE = `
freq() — The processor's speed in Hz.
time_pulse_us(pin, pulse_level, timeout_us=1000000) — How long, in µs, the pin stays at pulse_level.
`;

const TIME_FULL = `
sleep(seconds) — Waits: sleep(0.5) is half a second.
sleep_ms(ms) — Waits a number of milliseconds (1000 ms = 1 s).
sleep_us(us) — Waits a number of microseconds (1 000 000 µs = 1 s).
ticks_ms() — A millisecond counter: subtract two readings with ticks_diff() to time something.
ticks_us() — A microsecond counter.
ticks_cpu() — The processor's own fast counter.
ticks_add(ticks, delta) — A ticks value delta later (or earlier, if negative).
ticks_diff(ticks1, ticks2) — How much later ticks1 is than ticks2: ticks_diff(time.ticks_ms(), start).
time() — Seconds since 1 January 2000 (1970 on the Pico W) by the board's clock.
time_ns() — Nanoseconds since the start of the epoch.
localtime(secs=None) — The date and time as (year, month, day, hour, minute, second, weekday, yearday).
gmtime(secs=None) — The date and time in UTC, as localtime().
mktime(t) — Seconds since the epoch from a (year, month, day, hour, minute, second, weekday, yearday) tuple.
`;

const TIME_MICROBIT = `
sleep(seconds) — Waits: sleep(0.5) is half a second.
sleep_ms(ms) — Waits a number of milliseconds (1000 ms = 1 s).
sleep_us(us) — Waits a number of microseconds.
ticks_ms() — A millisecond counter: subtract two readings with ticks_diff() to time something.
ticks_us() — A microsecond counter.
ticks_add(ticks, delta) — A ticks value delta later (or earlier, if negative).
ticks_diff(ticks1, ticks2) — How much later ticks1 is than ticks2.
`;

const RANDOM = `
random() — A random number from 0.0 up to (not including) 1.0.
randint(a, b) — A random whole number from a to b, both included: randint(1, 6) is a dice.
randrange(start, stop, step=1) — A random whole number from range(start, stop, step).
uniform(a, b) — A random number between a and b.
choice(sequence) — One item of a list or string, at random.
seed(n=None) — Starts the random numbers from n, so they come out the same each time.
getrandbits(n) — A random number of n bits.
`;

const MATH = `
pi — 3.14159…, half a turn in radians.
e — 2.71828…
tau — 6.28318…, a whole turn in radians.
inf — Infinity.
nan — Not a number.
sqrt(x) — The square root of x.
pow(x, y) — x to the power y.
exp(x) — e to the power x.
expm1(x) — exp(x) − 1, accurately for small x.
log(x, base=e) — The logarithm of x.
log2(x) — The base-2 logarithm of x.
log10(x) — The base-10 logarithm of x.
sin(x) — The sine of x (x in radians).
cos(x) — The cosine of x (x in radians).
tan(x) — The tangent of x (x in radians).
asin(x) — The angle whose sine is x, in radians.
acos(x) — The angle whose cosine is x, in radians.
atan(x) — The angle whose tangent is x, in radians.
atan2(y, x) — The angle of the point (x, y), in radians.
sinh(x) — The hyperbolic sine of x.
cosh(x) — The hyperbolic cosine of x.
tanh(x) — The hyperbolic tangent of x.
asinh(x) — The inverse hyperbolic sine of x.
acosh(x) — The inverse hyperbolic cosine of x.
atanh(x) — The inverse hyperbolic tangent of x.
degrees(x) — Radians to degrees.
radians(x) — Degrees to radians.
ceil(x) — x rounded up to a whole number.
floor(x) — x rounded down to a whole number.
trunc(x) — x with the part after the point dropped.
fabs(x) — x without its sign.
fmod(x, y) — The remainder of x / y.
modf(x) — The part after the point and the whole part of x.
frexp(x) — x as (mantissa, exponent).
ldexp(x, exp) — x × 2 to the power exp.
copysign(x, y) — x with the sign of y.
isclose(a, b, *, rel_tol=1e-09, abs_tol=0) — True if a and b are nearly equal.
isfinite(x) — True if x is a number, not infinity or nan.
isinf(x) — True if x is infinity.
isnan(x) — True if x is nan.
factorial(n) — 1 × 2 × … × n.
gamma(x) — The gamma function of x.
lgamma(x) — The log of the gamma function of x.
erf(x) — The error function of x.
erfc(x) — 1 − erf(x).
`;

const OS_FULL = `
listdir(dir='.') — The names of the files and folders on the board.
remove(path) — Deletes a file on the board.
unlink(path) — Deletes a file, as remove().
rename(old_path, new_path) — Renames a file on the board.
mkdir(path) — Makes a folder on the board.
rmdir(path) — Deletes an empty folder.
chdir(path) — Changes the current folder.
getcwd() — The current folder.
stat(path) — Facts about a file: its size is stat(path)[6].
statvfs(path) — How much space the board's storage has: free bytes = s[0] × s[3].
ilistdir(dir='.') — The files and folders with their types, one at a time.
sep — The folder separator: '/'.
`;

const OS_MICROBIT = `
listdir() — The names of the files on the micro:bit.
remove(filename) — Deletes a file on the micro:bit.
size(filename) — The size of a file in bytes.
uname() — What the micro:bit is and its MicroPython version.
`;

const SYS = `
exit(retval=0) — Ends the program.
print_exception(exc, file=sys.stdout) — Prints an exception with its traceback.
implementation — Which Python this is (micropython) and its version.
version — The Python version MicroPython follows.
version_info — The Python version as numbers.
platform — The board's chip family: 'rp2', 'esp32'.
argv — The program's arguments (empty on a board).
path — The folders import looks in: '' and '/lib'.
modules — The modules imported so far.
maxsize — The largest small whole number.
byteorder — 'little'.
stdin — The console's input.
stdout — The console's output.
stderr — Where errors go.
`;

const GC = `
collect() — Frees memory no longer used.
mem_free() — How many bytes of memory are free.
mem_alloc() — How many bytes of memory are in use.
enable() — Turns automatic memory clean-up on.
disable() — Turns automatic memory clean-up off.
isenabled() — True if automatic clean-up is on.
threshold(amount=None) — Clean up after this many bytes are used.
`;

const MICROPYTHON = `
const(expr) — A constant: MicroPython puts its value straight in the code. LED_PIN = const(15)
schedule(func, arg) — Runs func(arg) soon, outside an interrupt.
mem_info() — Prints how memory is used.
qstr_info() — Prints the interned strings.
stack_use() — How much of the stack is in use.
pystack_use() — How much of the Python stack is in use.
opt_level(level=None) — How much the compiler optimises.
kbd_intr(chr) — Which key stops the program (3 = Ctrl+C); -1 turns it off.
heap_lock() — Stops memory being allocated (to test interrupt code).
heap_unlock() — Lets memory be allocated again.
`;

const MICROBIT = `
display: Display — The 5 × 5 LED display.
~Display — The 5 × 5 LED display.
Display.show(image, delay=400, *, wait=True, loop=False, clear=False) — Shows a picture, a number or text, one character at a time: display.show(Image.HEART).
Display.scroll(text, delay=150, *, wait=True, loop=False, monospace=False) — Scrolls text across the display.
Display.clear() — Turns every LED off.
Display.get_pixel(x, y) — How bright the LED at column x, row y is: 0–9.
Display.set_pixel(x, y, value) — Lights the LED at column x, row y: 0 (off) to 9 (brightest).
Display.on() — Turns the display on.
Display.off() — Turns the display off (its pins can then be used for other things).
Display.is_on() — True if the display is on.
Display.read_light_level() — How much light falls on the display: 0 (dark) to 255 (bright).
button_a: Button — Button A, on the left.
button_b: Button — Button B, on the right.
~Button — A button on the front of the micro:bit.
Button.is_pressed() — True while the button is held down.
Button.was_pressed() — True if it was pressed since the last time you asked.
Button.get_presses() — How many times it was pressed since the last time you asked; starts again at 0.
pin0: TouchPin — Pin 0, the big ring: digital, analog and touch.
pin1: TouchPin — Pin 1, the big ring: digital, analog and touch.
pin2: TouchPin — Pin 2, the big ring: digital, analog and touch.
pin3: AnalogPin — Pin 3: digital and analog (shared with the display).
pin4: AnalogPin — Pin 4: digital and analog (shared with the display).
pin10: AnalogPin — Pin 10: digital and analog (shared with the display).
pin5: DigitalPin — Pin 5: digital (button A).
pin6: DigitalPin — Pin 6: digital (shared with the display).
pin7: DigitalPin — Pin 7: digital (shared with the display).
pin8: DigitalPin — Pin 8: digital.
pin9: DigitalPin — Pin 9: digital (shared with the display).
pin11: DigitalPin — Pin 11: digital (button B).
pin12: DigitalPin — Pin 12: digital.
pin13: DigitalPin — Pin 13: digital (SPI SCK).
pin14: DigitalPin — Pin 14: digital (SPI MISO).
pin15: DigitalPin — Pin 15: digital (SPI MOSI).
pin16: DigitalPin — Pin 16: digital.
pin19: DigitalPin — Pin 19: digital (I2C SCL).
pin20: DigitalPin — Pin 20: digital (I2C SDA).
pin_logo: LogoPin — The gold logo on the front: touch it.
pin_speaker: DigitalPin — The built-in speaker.
~DigitalPin — A pin on the edge connector.
DigitalPin.write_digital(value) — Sets the pin to 1 (3.3 V) or 0 (0 V).
DigitalPin.read_digital() — Reads the pin: 1 or 0.
DigitalPin.write_analog(value) — PWM: 0 (always off) to 1023 (always on) — dims an LED.
DigitalPin.set_analog_period(period) — The PWM period in milliseconds (a servo: 20).
DigitalPin.set_analog_period_microseconds(period) — The PWM period in microseconds.
DigitalPin.get_analog_period_microseconds() — The PWM period in microseconds.
DigitalPin.set_pull(value) — Turns on the pin's own resistor: pin0.PULL_UP, PULL_DOWN or NO_PULL.
DigitalPin.get_pull() — Which pull resistor is on.
DigitalPin.get_mode() — What the pin is being used for: 'read_digital', 'write_analog' …
DigitalPin.PULL_UP — set_pull(): the pin's own resistor to 3.3 V, so it reads 1 until joined to GND.
DigitalPin.PULL_DOWN — set_pull(): the pin's own resistor to GND, so it reads 0 until joined to 3.3 V.
DigitalPin.NO_PULL — set_pull(): no resistor; the pin reads whatever it is joined to.
~AnalogPin < DigitalPin — A pin that can also read a voltage.
AnalogPin.read_analog() — Reads the voltage: 0 (0 V) to 1023 (3.3 V).
~TouchPin < AnalogPin — A big ring pin: also feels a finger.
TouchPin.is_touched() — True while a finger is on the pin (and GND).
TouchPin.set_touch_mode(value) — How it feels a touch: pin0.RESISTIVE or pin0.CAPACITIVE.
TouchPin.RESISTIVE — Touch by a finger joining the pin to GND.
TouchPin.CAPACITIVE — Touch by a finger near the pin.
~LogoPin — The touch logo.
LogoPin.is_touched() — True while a finger is on the logo.
LogoPin.set_touch_mode(value) — pin_logo.CAPACITIVE (the start) or RESISTIVE.
LogoPin.RESISTIVE — Touch by a finger joining it to GND.
LogoPin.CAPACITIVE — Touch by a finger on it.
accelerometer: Accelerometer — Feels tilting, shaking and falling.
~Accelerometer — Feels tilting, shaking and falling.
Accelerometer.get_x() — Tilt left (−) or right (+), in milli-g: about ±1024 on its side.
Accelerometer.get_y() — Tilt forward (−) or back (+), in milli-g.
Accelerometer.get_z() — Up (−) or down (+), in milli-g: −1024 lying flat.
Accelerometer.get_values() — (x, y, z) at once.
Accelerometer.get_strength() — How hard it is pushed altogether, in milli-g (1024 when still).
Accelerometer.current_gesture() — What is happening now: 'up', 'down', 'left', 'right', 'face up', 'face down', 'freefall', 'shake' …
Accelerometer.is_gesture(name) — True if that gesture is happening now.
Accelerometer.was_gesture(name) — True if that gesture happened since the last time you asked.
Accelerometer.get_gestures() — Every gesture since the last time you asked.
Accelerometer.set_range(value) — The largest force it measures, in g: 2, 4 or 8.
microphone: Microphone — Hears how loud it is around the micro:bit (V2).
~Microphone — The microphone next to the logo.
Microphone.sound_level() — How loud it is now: 0 (silent) to 255.
Microphone.current_event() — SoundEvent.LOUD or SoundEvent.QUIET, what it heard last; None if nothing yet.
Microphone.is_event(event) — True if that is what it hears now.
Microphone.was_event(event) — True if it heard that since the last time you asked.
Microphone.get_events() — Every sound event since the last time you asked.
Microphone.set_threshold(event, value) — The level (0–255) that counts as loud, or as quiet again.
SoundEvent — A sound event: SoundEvent.LOUD or SoundEvent.QUIET.
SoundEvent.LOUD — The sound got louder than the loud level.
SoundEvent.QUIET — The sound fell back under the quiet level.
i2c: I2CBus — The I2C bus on pins 19 (SCL) and 20 (SDA).
~I2CBus — The I2C bus.
I2CBus.init(freq=100000, sda=pin20, scl=pin19) — Sets the bus up.
I2CBus.scan() — The addresses of every device that answers.
I2CBus.read(addr, n, repeat=False) — Reads n bytes from the device.
I2CBus.write(addr, buf, repeat=False) — Writes the bytes in buf to the device.
spi: SPIBus — The SPI bus: SCK on pin 13, MOSI on 15, MISO on 14.
~SPIBus — The SPI bus.
SPIBus.init(baudrate=1000000, bits=8, mode=0, sclk=pin13, mosi=pin15, miso=pin14) — Sets the bus up: its speed and pins.
SPIBus.write(buf) — Clocks the bytes in buf out on MOSI.
SPIBus.read(nbytes, out=0) — Clocks nbytes in from MISO, sending out each time.
SPIBus.write_readinto(out, in_) — Sends out's bytes and reads as many into in_.
Image(string) — A picture for the display: Image("09090:99999:99999:09990:00900"), each digit a brightness 0–9.
Image.width() — How many columns: 5 for the display.
Image.height() — How many rows.
Image.get_pixel(x, y) — The brightness at column x, row y: 0–9.
Image.set_pixel(x, y, value) — Sets the brightness at column x, row y.
Image.shift_left(n) — A copy moved n columns left.
Image.shift_right(n) — A copy moved n columns right.
Image.shift_up(n) — A copy moved n rows up.
Image.shift_down(n) — A copy moved n rows down.
Image.crop(x, y, w, h) — The part of it w wide and h high from (x, y).
Image.copy() — A copy that can be changed.
Image.invert() — A copy with bright and dark swapped.
Image.fill(value) — Sets every pixel to value.
Image.blit(src, x, y, w, h, xdest=0, ydest=0) — Copies part of another image into this one.
Image.ALL_CLOCKS — The twelve clock pictures, to show one after another.
Image.ALL_ARROWS — The eight arrow pictures, to show one after another.
sleep(ms) — Waits a number of milliseconds: sleep(1000) is a second.
running_time() — Milliseconds since the micro:bit was switched on.
temperature() — The temperature in °C, from the chip.
set_volume(volume) — How loud the speaker is: 0 to 255.
scale(value, from_, to) — value moved from one range to another: scale(accelerometer.get_x(), (-1024, 1024), (0, 9)).
`;

const IMAGES = `HEART HEART_SMALL HAPPY SMILE SAD CONFUSED ANGRY ASLEEP SURPRISED SILLY FABULOUS MEH YES NO
CLOCK12 CLOCK1 CLOCK2 CLOCK3 CLOCK4 CLOCK5 CLOCK6 CLOCK7 CLOCK8 CLOCK9 CLOCK10 CLOCK11
ARROW_N ARROW_NE ARROW_E ARROW_SE ARROW_S ARROW_SW ARROW_W ARROW_NW TRIANGLE TRIANGLE_LEFT CHESSBOARD DIAMOND
DIAMOND_SMALL SQUARE SQUARE_SMALL RABBIT COW MUSIC_CROTCHET MUSIC_QUAVER MUSIC_QUAVERS PITCHFORK XMAS PACMAN TARGET
TSHIRT ROLLERSKATE DUCK HOUSE TORTOISE BUTTERFLY STICKFIGURE GHOST SWORD GIRAFFE SKULL UMBRELLA SNAKE SCISSORS`;

const MUSIC = `
play(music, pin=pin0, wait=True, loop=False) — Plays a tune: music.play(music.BIRTHDAY), or your own notes ['C4:4', 'E', 'G'].
pitch(frequency, duration=-1, pin=pin0, wait=True) — Plays one note: pitch(440, 500) is an A for half a second.
stop(pin=pin0) — Stops the music.
set_tempo(ticks=4, bpm=120) — How fast tunes play.
get_tempo() — The tempo as (ticks, bpm).
reset() — Sets the tempo back to its start.
`;

const RADIO = `
on() — Turns the radio on, to send and receive; it is off when the program starts.
off() — Turns the radio off.
config(length=32, queue=3, channel=7, power=6, data_rate=RATE_1MBIT, address=0x75626974, group=0) — Its settings: micro:bits on the same channel and group hear each other.
reset() — Its settings back to how they start.
send(message) — Sends a string to the micro:bits on its channel and group.
send_bytes(message) — Sends bytes as they are.
receive() — The oldest message waiting, as a string; None when there is none.
receive_bytes() — The oldest message waiting, as bytes; None when there is none.
receive_bytes_into(buffer) — The oldest message copied into buffer: how many bytes, or None.
receive_full() — The oldest message, its signal strength and when it came: (bytes, rssi, µs).
RATE_1MBIT — Sends at 1 Mbit/s, the usual speed.
RATE_2MBIT — Sends at 2 Mbit/s.
`;

const TUNES = `DADADADUM ENTERTAINER PRELUDE ODE NYAN RINGTONE FUNK BLUES BIRTHDAY WEDDING FUNERAL PUNCHLINE PYTHON BADDY
CHASE BA_DING WAWAWAWAA JUMP_UP JUMP_DOWN POWER_UP POWER_DOWN`;

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const picture = (name: string) => name.toLowerCase().replace(/_/g, ' ');

/** The modules each board has, as catalogue text. */
export const MODULES: Record<string, { boards: ApiBoard[]; doc: string; text: string }> = {
  machine: { boards: ['pico', 'esp32'], doc: 'The board\'s hardware: pins, ADC, PWM, timers, I2C, SPI, UART.', text: MACHINE },
  microbitMachine: { boards: ['microbit'], doc: 'A little of the hardware below the microbit module.', text: MICROBIT_MACHINE },
  time: { boards: ['pico', 'esp32'], doc: 'Waiting and timing.', text: TIME_FULL },
  microbitTime: { boards: ['microbit'], doc: 'Waiting and timing.', text: TIME_MICROBIT },
  utime: { boards: ['microbit'], doc: 'Waiting and timing (the old name of time).', text: TIME_MICROBIT },
  random: { boards: ['pico', 'esp32', 'microbit'], doc: 'Random numbers: dice, choices.', text: RANDOM },
  math: { boards: ['pico', 'esp32', 'microbit'], doc: 'Square roots, sines, pi …', text: MATH },
  os: { boards: ['pico', 'esp32'], doc: 'The files and folders on the board.', text: OS_FULL },
  microbitOs: { boards: ['microbit'], doc: 'The files on the micro:bit.', text: OS_MICROBIT },
  sys: { boards: ['pico', 'esp32'], doc: 'The Python system: exit(), the version.', text: SYS },
  gc: { boards: ['pico', 'esp32', 'microbit'], doc: 'Memory clean-up.', text: GC },
  micropython: { boards: ['pico', 'esp32', 'microbit'], doc: 'MicroPython\'s own tools: const(), schedule().', text: MICROPYTHON },
  microbit: {
    boards: ['microbit'],
    doc: 'Everything on the micro:bit: display, buttons, pins, accelerometer. from microbit import *',
    text: MICROBIT + words(IMAGES).map((n) => `Image.${n} — The built-in ${picture(n)} picture.`).join('\n'),
  },
  radio: { boards: ['microbit'], doc: 'The micro:bit\'s own radio, between micro:bits: send and receive messages.', text: RADIO },
  music: {
    boards: ['microbit'],
    doc: 'Tunes and notes on the speaker (or a buzzer on pin 0).',
    text: MUSIC + words(TUNES).map((n) => `${n} — A built-in tune: music.play(music.${n}).`).join('\n'),
  },
};

/** A module's name as imported: the micro:bit's own versions share the usual name. */
export const IMPORT_NAME: Record<string, string> = { microbitMachine: 'machine', microbitTime: 'time', microbitOs: 'os' };
