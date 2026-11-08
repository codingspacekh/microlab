#!/usr/bin/env python3
"""Build the static UI prototype screens for MicroLab.

Reads  design/src/*.html  (templates)  and writes  design/screens/*.html  — the same
conventions as the gradebook's prototype (../schoolassessment/design).

Template tags:
  {{include:name}}                    -> contents of src/partials/name.html
  {{i:name}} / {{i:name:extra-class}} -> inline SVG icon
  {{scene:name[:args]}}               -> a circuit or picture drawn from real pin positions (scenes.py)
  {{code:name[:cur=N][:err=N]}}       -> line-numbered, highlighted MicroPython
  {{parts:hover:drag}}                -> the parts panel
  {{part:kind}}                       -> a part icon
  {{pinout:left|right:filter}}        -> Pico W pin rows with their functions (board page)
  {{picov:filter}}                    -> the Pico W drawn upright for the board page
  {{examples}}                        -> the example cards
  <!--@NAME: value--> ... {{NAME}}    -> per-page variable (unset = empty)

Run:  python3 design/build.py
"""
import html
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import scenes  # noqa: E402
from svgparts import icon_svg, PICO_B, PICO_T  # noqa: E402

SRC = ROOT / "src"
OUT = ROOT / "screens"

FILLED = {"play", "stop", "dotfill"}
ICONS = {
    "play": '<path d="M7 4.5v15l12.5-7.5z"/>',
    "stop": '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    "dotfill": '<circle cx="12" cy="12" r="5"/>',
    "restart": '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/>',
    "undo": '<path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    "redo": '<path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    "plug": '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>',
    "book": '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7"/>',
    "search": '<path d="M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14M16.5 16.5L21 21"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "minus": '<path d="M5 12h14"/>',
    "info": '<path d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18M12 11v5M12 8h.01"/>',
    "warn": '<path d="M12 3.5l9 16H3zM12 10v4M12 17h.01"/>',
    "alert": '<path d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18M12 8v5M12 16h.01"/>',
    "check": '<path d="M5 12.5l4.5 4.5L19 7"/>',
    "chevr": '<path d="M9 6l6 6-6 6"/>', "chevd": '<path d="M6 9l6 6 6-6"/>', "chevl": '<path d="M15 6l-6 6 6 6"/>',
    "x": '<path d="M6 6l12 12M18 6L6 18"/>',
    "file": '<path d="M6 3h8l4 4v14H6zM14 3v4h4"/>',
    "folder": '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    "zoomin": '<path d="M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14M16.5 16.5L21 21M8 11h6M11 8v6"/>',
    "zoomout": '<path d="M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14M16.5 16.5L21 21M8 11h6"/>',
    "fit": '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    "rotate": '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4"/>',
    "trash": '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    "copy": '<path d="M8 8h11v11H8zM5 16V5h11"/>',
    "grid": '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
    "bolt": '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    "bulb": '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3"/>',
    "plot": '<path d="M4 19h16M4 5v14M7 15l4-5 3 3 5-7"/>',
    "term": '<path d="M4 5h16v14H4zM8 10l3 2-3 2M13 15h3"/>',
    "home": '<path d="M4 11l8-7 8 7M6 9.5V20h12V9.5"/>',
    "ext": '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
    "cpu": '<path d="M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
    "meter": '<path d="M6 3h12v18H6zM9 6h6v5H9zM9.5 15h.01M14.5 15h.01M12 18h.01"/>',
    "wire": '<path d="M5 19a2 2 0 1 0 0-4a2 2 0 0 0 0 4M19 9a2 2 0 1 0 0-4a2 2 0 0 0 0 4M6.5 15.5C9 9 15 15 17.5 8.5"/>',
    "more": '<path d="M12 6h.01M12 12h.01M12 18h.01" stroke-width="3"/>',
    "send": '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
    "clock": '<path d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18M12 7v5l3 2"/>',
    "list": '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    "tilt": '<path d="M5 15l7-11 7 11zM3 20h18"/>',
    "ruler": '<path d="M3 8h18v8H3zM7 8v3M11 8v4M15 8v3M19 8v4"/>',
    "shake": '<path d="M8 4h8v16H8zM4 8v8M20 8v8M2 10v4M22 10v4"/>',
    "sun": '<path d="M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    "drop": '<path d="M12 3s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z"/>',
    "sliders": '<path d="M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4"/>',
    "therm": '<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0zM12 9v7"/>',
    "mic": '<path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM6 11a6 6 0 0 0 12 0M12 17v4"/>',
    "sound": '<path d="M4 9h4l5-4v14l-5-4H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
    "soundoff": '<path d="M4 9h4l5-4v14l-5-4H4zM17 9.5l5 5M22 9.5l-5 5"/>',
    "touch": '<path d="M12 4a6 6 0 0 0-6 6M12 4a6 6 0 0 1 6 6M9 13a3 3 0 0 1 6 0v5"/>',
    "heart": '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    "usb": '<path d="M10 3h4v5h-4zM8 8h8v8a4 4 0 0 1-8 0zM12 20v2"/>',
    "lock": '<path d="M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3"/>',
}


def icon(name: str, cls: str = "") -> str:
    fill = " fill" if name in FILLED else ""
    return f'<svg class="ico{fill} {cls}" viewBox="0 0 24 24">{ICONS[name]}</svg>'


# ---------------------------------------------------------------- MicroPython code shown in the screens
CODE = {
    "traffic": '''from machine import Pin
import time

red = Pin(15, Pin.OUT)
amber = Pin(14, Pin.OUT)
green = Pin(13, Pin.OUT)
button = Pin(16, Pin.IN, Pin.PULL_UP)

def show(r, a, g):
    red.value(r)
    amber.value(a)
    green.value(g)

show(0, 0, 1)                    # green: cars go
while True:
    if button.value() == 0:      # pressed: reads 0
        print("Button pressed: stopping traffic")
        show(0, 1, 0)            # amber
        time.sleep(2)
        show(1, 0, 0)            # red: people cross
        time.sleep(5)
        show(0, 0, 1)
        print("Green again")
    time.sleep(0.05)''',
    "moodlamp": '''from machine import Pin, ADC
import time

red = Pin(15, Pin.OUT)
green = Pin(14, Pin.OUT)
blue = Pin(13, Pin.OUT)
switch = Pin(16, Pin.IN, Pin.PULL_UP)   # slid to 3: reads 0
light = ADC(26)                         # more light: more volts

while True:
    on = switch.value() == 0
    dark = light.read_u16() < 20000
    red.value(on and dark)
    blue.value(on and dark)             # red + blue: purple
    green.value(on and not dark)
    print(light.read_u16())
    time.sleep(0.5)''',
    "bmp280lib": '''from machine import I2C, Pin
from bmp280 import BMP280
import time

bmp = BMP280(I2C(0, sda=Pin(4), scl=Pin(5)))
bmp.normal_measure()
while True:
    print(bmp.temperature, 'C', bmp.pressure / 100, 'hPa')
    time.sleep(1)''',
    "weather": '''from machine import I2C, Pin
from bmp280 import BMP280
from vl53l0x import VL53L0X
import time

i2c = I2C(0, sda=Pin(4), scl=Pin(5))
bmp = BMP280(i2c)
tof = VL53L0X(i2c)
bmp.normal_measure()

while True:
    print(bmp.pressure / 100, 'hPa', tof.ping(), 'mm')
    time.sleep(1)''',
    "chips": '''from machine import I2C, Pin
import time
from ds1302 import DS1302

i2c = I2C(0, sda=Pin(4), scl=Pin(5))
rtc = DS1302(Pin(13), Pin(14), Pin(16))
print(i2c.scan())            # [41, 72, 87, 118]

while True:
    h, m, s = rtc.time()[3:]
    print('%02d:%02d:%02d' % (h, m, s),
          distance(), 'mm', pressure(), 'hPa')
    time.sleep(1)''',
    "kit": '''from machine import Pin, ADC
import time

joy_x = ADC(26)                      # VRx: 0 – 3.3 V
gas = ADC(27)                        # MQ-2's AO (5 V supply)
obstacle = Pin(14, Pin.IN)           # 0: something in front
magnet = Pin(13, Pin.IN)             # 0: a magnet near

while True:
    print(joy_x.read_u16() // 655, '%',
          'gas!' if gas.read_u16() > 40000 else 'air',
          'blocked' if not obstacle.value() else 'clear',
          'magnet' if not magnet.value() else '-')
    time.sleep(0.5)''',
    "modules": '''from machine import Pin, I2C, time_pulse_us
import dht, struct, time

air = dht.DHT22(Pin(20))
trig, echo = Pin(22, Pin.OUT), Pin(21, Pin.IN)
i2c = I2C(1, sda=Pin(26), scl=Pin(27))
i2c.writeto_mem(0x68, 0x6B, b'\\x00')   # wake it up

while True:
    air.measure()
    trig.value(1); time.sleep_us(10); trig.value(0)
    cm = time_pulse_us(echo, 1, 30000) / 58
    x, y, z = struct.unpack('>hhh', i2c.readfrom_mem(0x68, 0x3B, 6))
    print('%.1f C %.0f %%  %d cm  x %.2f g' % (
        air.temperature(), air.humidity(), cm, x / 16384))
    time.sleep(2)''',
    "actuators": '''from machine import Pin, PWM
import time

servo = PWM(Pin(28), freq=50)          # SG90: a pulse every 20 ms
ia = PWM(Pin(27), freq=1000)           # L9110S A-IA: the speed
ib = Pin(26, Pin.OUT)                  # A-IB: 0 forward, 1 back
pump = Pin(22, Pin.OUT)                # the relay's S
blue = PWM(Pin(19), freq=1000)         # the RGB module's B

def angle(deg):                        # 0.5 ms … 2.5 ms
    servo.duty_ns(500_000 + deg * 2_000_000 // 180)

while True:
    angle(135)
    ib.value(0); ia.duty_u16(45_000)   # forward, 70 %
    pump.value(1); blue.duty_u16(65_535)
    time.sleep(3)
    angle(45)
    ia.duty_u16(0); pump.value(0); blue.duty_u16(0)
    time.sleep(3)''',
    "moreoutputs": '''from machine import Pin, PWM
import time

coils = [Pin(n, Pin.OUT) for n in (28, 27, 26, 22)]   # IN1–IN4
red, amber, green = Pin(21, Pin.OUT), Pin(20, Pin.OUT), Pin(19, Pin.OUT)
tone = PWM(Pin(18))                    # the passive buzzer's I/O
in3, in4 = Pin(17, Pin.OUT), Pin(16, Pin.OUT)   # L298N motor B
HALF = [(1,0,0,0), (1,1,0,0), (0,1,0,0), (0,1,1,0),
        (0,0,1,0), (0,0,1,1), (0,0,0,1), (1,0,0,1)]

green.on(); in3.off(); in4.on()        # MOTOR2 turns back
tone.freq(440); tone.duty_u16(32_768)  # A4
for step in range(4096):               # one turn of the 28BYJ-48
    for pin, v in zip(coils, HALF[step % 8]):
        pin.value(v)
    time.sleep_ms(2)
tone.duty_u16(0)''',
    "outputfaults": '''from machine import Pin, PWM
import time

motor = Pin(15, Pin.OUT)               # MOTOR1 straight on the pin
servo = PWM(Pin(16), freq=50)          # SG90 on 3V3

motor.on()
while True:
    servo.duty_ns(2_000_000)
    time.sleep(1)
    servo.duty_ns(1_000_000)
    time.sleep(1)''',
    "greenhouse": '''from machine import Pin, ADC
import time

pir = Pin(22, Pin.IN)     # HC-SR501 on VBUS (5 V)
line = Pin(21, Pin.IN)    # 0 over white, 1 over the line
soil = ADC(27)            # dry 2.4 V … wet 0.9 V
temp = ADC(26)            # TMP36: 0.5 V + 10 mV per °C

while True:
    c = (temp.read_u16() * 3.3 / 65535 - 0.5) * 100
    dry = soil.read_u16() > 30000
    print(round(c), 'C', 'dry' if dry else 'wet',
          'motion' if pir.value() else '-',
          'line' if line.value() else 'white')
    time.sleep(0.5)''',
    "traffic_typing": '''from machine import Pin
import time

red = Pin(15, Pin.OUT)
amber = Pin(14, Pin.OUT)
green = Pin(13, Pin.OUT)
button = Pin(16, Pin.IN, Pin.PU⟨caret⟩

def show(r, a, g):
    red.value(r)
    amber.value(a)
    green.value(g)

show(0, 0, 1)                    # green: cars go
while True:
    if button.value() == 0:      # pressed: reads 0
        print("Button pressed: stopping traffic")
        show(0, 1, 0)            # amber
        time.sleep(2)
        show(1, 0, 0)            # red: people cross
        time.sleep(5)
        show(0, 0, 1)
        print("Green again")
    time.sleep(0.05)''',
    "distance": '''from machine import Pin, I2C, time_pulse_us
import ssd1306
import time

trig = Pin(5, Pin.OUT)
echo = Pin(18, Pin.IN)
i2c = I2C(0, scl=Pin(22), sda=Pin(21))
oled = ssd1306.SSD1306_I2C(128, 64, i2c)

def distance_cm():
    trig.value(1)
    time.sleep_us(10)
    trig.value(0)
    t = time_pulse_us(echo, 1, 30000)  # echo, µs
    return t / 58  # 58 µs per cm, there and back

while True:
    d = distance_cm()
    oled.fill(0)
    oled.text("Distance", 0, 0)
    oled.text("%.1f cm" % d, 0, 24)
    oled.fill_rect(0, 48, min(int(d), 128), 10, 1)
    oled.show()
    print(d)
    time.sleep(0.2)''',
    "heart": '''from microbit import *
import music

while True:
    if button_a.was_pressed():
        print("A pressed")
        display.show(Image.HEART)
        music.play(music.BA_DING)  # pin 0 + speaker
    elif button_b.was_pressed():
        level = pin2.read_analog()  # knob: 0–1023
        display.scroll(level)
    elif accelerometer.was_gesture('shake'):
        display.show(Image.SURPRISED)
    sleep(100)''',
    "servo": '''from machine import Pin, PWM
import time

servo = PWM(Pin(15))
servo.freq(50)               # one pulse every 20 ms

def angle(deg):
    us = 500 + deg * 2000 // 180  # 0.5–2.5 ms
    servo.duty_ns(us * 1000)

for a in (0, 90, 180, 90):
    angle(a)
    time.sleep(1)''',
    "adc": '''from machine import ADC
knob = ADC(26)          # GP26
print(knob.read_u16())  # 0 … 65535''',
}

KW = {"from", "import", "as", "def", "return", "while", "if", "elif", "else", "for", "in", "and", "or", "not",
      "True", "False", "None", "pass", "break", "continue", "with", "try", "except", "class", "lambda"}
BUILTINS = {"print", "range", "int", "str", "float", "len", "min", "max", "abs", "round", "sleep"}
TOK = re.compile(r"(#.*$)|(\"[^\"]*\"|'[^']*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(⟨caret⟩)|(⟦|⟧)|(.)", re.S)


def hl(line: str) -> str:
    out = []
    for m in TOK.finditer(line):
        com, s, num, ident, caret, mark, other = m.groups()
        if com:
            out.append(f'<span class="c">{html.escape(com)}</span>')
        elif s:
            out.append(f'<span class="s">{html.escape(s)}</span>')
        elif num:
            out.append(f'<span class="n">{num}</span>')
        elif ident:
            nxt = line[m.end():m.end() + 1]
            if ident in KW:
                out.append(f'<span class="k">{ident}</span>')
            elif ident in BUILTINS or nxt == "(":
                out.append(f'<span class="f">{ident}</span>')
            else:
                out.append(ident)
        elif caret:
            out.append('<span style="border-left:2px solid var(--accent);margin-left:1px"></span>')
        elif mark:
            out.append('<span class="bad">' if mark == "⟦" else "</span>")
        else:
            out.append(html.escape(other))
    return "".join(out)


def code(name: str, *opts: str) -> str:
    o = dict(x.split("=") for x in opts)
    cur, err = int(o.get("cur", 0)), int(o.get("err", 0))
    text = CODE[name]
    if err:  # the misspelt name on the error line is underlined
        lines = text.split("\n")
        lines[err - 1] = lines[err - 1].replace("Pin(14", "⟦pin⟧(14", 1)
        text = "\n".join(lines)
    rows = []
    for i, line in enumerate(text.split("\n"), 1):
        cls = " cur" if i == cur else " err" if i == err else ""
        mark = f'<span class="runmark">{icon("play", "s12")}</span>' if i == cur else ""
        rows.append(f'<div class="ln{cls}">{mark}<span class="no">{i}</span><span class="tx">{hl(line) or " "}</span></div>')
    return "".join(rows)


# ---------------------------------------------------------------- parts panel
PARTS = [
    ("Basics", [("breadboard", "Breadboard", "mini · half · full"), ("resistor", "Resistor", "220 Ω – 10 kΩ"), ("led", "LED", "5 colours"),
                ("rgb", "RGB LED", "common cathode"), ("button", "Push button", "12 mm"), ("switch", "Slide switch", ""),
                ("pot", "Potentiometer", "10 kΩ knob"), ("ldr", "Light sensor (LDR)", ""), ("buzzer", "Buzzer", "active · passive"),
                ("battery", "Battery pack", "2×AA · 4×AA · 9 V")]),
    ("Sensors", [("hcsr04", "Ultrasonic HC-SR04", "distance"), ("dht", "DHT11 / DHT22", "temperature, humidity"), ("mpu6050", "MPU6050 motion", "accelerometer · I²C"), ("pir", "PIR motion", ""),
                 ("line", "Line sensor (IR)", ""), ("soil", "Soil moisture", ""), ("tmp36", "TMP36 temperature", "")]),
    ("Modules", [("kbutton", "Button module", ""), ("ktouch", "Touch (TTP223)", ""), ("kvibration", "Vibration (SW-420)", ""),
                 ("kir", "IR obstacle", ""), ("khall", "Hall", "magnet"), ("kflame", "Flame", "AO · DO"), ("krain", "Raindrop", "AO · DO"),
                 ("kwater", "Water level", ""), ("kgas", "Gas / smoke (MQ-2)", "5 V"), ("kldr", "Photoresistor module", ""),
                 ("kpot", "Potentiometer module", ""), ("kjoystick", "Joystick", "X · Y · button"), ("kencoder", "Rotary encoder", "KY-040"),
                 ("kspeed", "IR speed sensor", "20-slot wheel")]),
    ("Chips", [("pcf8591", "PCF8591", "ADC · DAC · I²C"), ("bmp280", "BMP280", "pressure · I²C"), ("ds18b20", "DS18B20", "temperature · 1-Wire"),
               ("ds1302", "DS1302 clock", "real-time clock"), ("vl53l0x", "VL53L0X", "laser distance · I²C"), ("max30102", "MAX30102", "pulse · SpO2 · I²C")]),
    ("Actuators", [("servo", "Servo SG90", "0–180°"), ("motor", "TT motor", "3–6 V gear motor"), ("driver", "L9110S driver", "two motors"),
                   ("l298n", "L298N driver", "two motors · 5–12 V"), ("relay", "Relay module", "5 V · NO / NC"), ("pump", "Water pump", "3–6 V"),
                   ("stepper", "Stepper 28BYJ-48", "with ULN2003")]),
    ("Output modules", [("traffic", "Traffic light module", "R Y G"), ("krgb", "RGB LED module", "R G B"), ("kbuzzer", "Passive buzzer module", "plays notes"),
                        ("psu", "Breadboard power supply", "5 V · 3.3 V")]),
    ("Displays", [("oled", "OLED SSD1306", "128×64 · I²C"), ("lcd", "LCD 16×2", "I²C"), ("seg7", "7-segment digit", ""),
                  ("neopixel", "NeoPixel strip / ring", "WS2812")]),
]


MICROBIT_PARTS = [("micro:bit", [("gpioboard", "GPIO board", "30 pins · 5V from its USB")])]


def parts(hover: str = "", drag: str = "", board: str = "", opened: str = "") -> str:
    """`board` = microbit: the micro:bit's own group first (screen 24: its GPIO board). `opened`: the groups shown
    open, '+'-separated (the others folded to their heading, as the student left them); all open if not set."""
    out = []
    keep = set(opened.split("+")) if opened else None
    for group, items in (MICROBIT_PARTS if board == "microbit" else []) + PARTS:
        folded = keep is not None and group not in keep
        out.append(f'<div class="pgroup"><div class="gh">{icon("chevr" if folded else "chevd", "s12")} {group}<span class="n">{len(items)}</span></div>')
        if folded:
            out.append("</div>")
            continue
        for kind, name, sub in items:
            cls = " hover" if kind == hover else " drag" if kind == drag else ""
            small = f"<small>{sub}</small>" if sub else ""
            out.append(f'<div class="pitem{cls}"><span class="pic">{icon_svg(kind)}</span><span class="nm">{name}{small}</span>'
                       f'<span class="lrn" title="Learn about it">{icon("book", "s14")}</span></div>')
        out.append("</div>")
    return "".join(out)


def part(kind: str, cls: str = "p") -> str:
    return icon_svg(kind, cls)


# ---------------------------------------------------------------- Pico W pin functions (board page, pin tooltips)
I2C = {0: "I2C0 SDA", 1: "I2C0 SCL", 2: "I2C1 SDA", 3: "I2C1 SCL"}
UART = {0: "UART0 TX", 1: "UART0 RX", 4: "UART1 TX", 5: "UART1 RX", 8: "UART1 TX", 9: "UART1 RX",
        12: "UART0 TX", 13: "UART0 RX", 16: "UART0 TX", 17: "UART0 RX"}


def functions(name: str):
    """[(css class, label)] for one Pico W pin, as on the official pinout (checked against it in M1)."""
    if name in ("GND", "AGND"):
        return [("gnd", "GND")]
    if name in ("VBUS", "VSYS", "3V3", "3V3_EN", "ADC_VREF"):
        return [("power", {"VBUS": "5 V USB", "VSYS": "1.8–5.5 V in", "3V3": "3.3 V out", "3V3_EN": "3V3 on/off", "ADC_VREF": "ADC ref"}[name])]
    if name == "RUN":
        return [("gpio", "Reset")]
    n = int(name[2:])
    fx = [("pwm", f"PWM{n // 2 % 8}{'AB'[n % 2]}")]  # every GP pin is also a digital in/out
    if n in (26, 27, 28):
        fx.append(("adc", f"ADC{n - 26}"))
    if n <= 21 or n in (26, 27):
        fx.append(("i2c", I2C[(n // 2 % 2) * 2 + n % 2]))
    if n <= 19:
        fx.append(("spi", f"SPI{0 if n // 8 % 2 == 0 else 1} {['RX', 'CSn', 'SCK', 'TX'][n % 4]}"))
    if n in UART:
        fx.append(("uart", UART[n]))
    return fx


def pinout(side: str, filt: str = "") -> str:
    """Rows beside the upright Pico: left = pins 1–20, right = pins 40–21 (USB at the top)."""
    names = PICO_B if side == "left" else PICO_T
    numbers = range(1, 21) if side == "left" else range(40, 20, -1)
    rows = []
    for no, name in zip(numbers, names):
        fx = functions(name)
        match = not filt or any(k == filt for k, _ in fx)
        chips = "".join(f'<span class="fn {k}{"" if (not filt or k == filt) else " dim"}">{lab}</span>' for k, lab in fx)
        nm = f'<span class="nm" style="{"" if match else "opacity:.3"}">{name}</span>'
        num = f'<span class="pn">{no}</span>'
        if side == "left":
            rows.append(f'<div class="pinrow" style="justify-content:flex-end">{chips}{nm}{num}</div>')
        else:
            rows.append(f'<div class="pinrow">{num}{nm}{chips}</div>')
    return "".join(rows)


def picov(filt: str = "") -> str:
    """The Pico W standing up for the board page: pads line up with the 26 px pin rows."""
    w, h = 150, 580
    o = [f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" font-family="Inter">',
         f'<rect x="10" y="22" width="130" height="536" rx="8" fill="#2b7a4b" stroke="#1d5a37"/>',
         '<rect x="55" y="6" width="40" height="30" rx="4" fill="#c7ccd2" stroke="#8f969f"/><rect x="63" y="10" width="24" height="12" rx="2" fill="#6d747c"/>',
         '<rect x="47" y="250" width="56" height="56" rx="3" fill="#1c1e21"/><text x="75" y="282" font-size="9" fill="#8d939b" text-anchor="middle" font-family="JetBrains Mono">RP2040</text>',
         '<rect x="44" y="410" width="62" height="70" rx="4" fill="#c3c8ce" stroke="#9aa1a9"/>',
         '<path d="M50,500 h50 v8 h-50 v8 h50 v8 h-50 v8 h50" stroke="#5fae80" stroke-width="2.4" fill="none"/>',
         '<circle cx="62" cy="70" r="8" fill="#f4f4f4" stroke="#b8b8b8"/><text x="62" y="90" font-size="7" fill="#d8eadf" text-anchor="middle" font-family="JetBrains Mono">BOOTSEL</text>',
         '<rect x="90" y="56" width="10" height="6" rx="1" fill="#d7e6db"/><text x="95" y="72" font-size="7" fill="#d8eadf" text-anchor="middle" font-family="JetBrains Mono">LED</text>',
         '<text x="75" y="160" font-size="14" font-weight="700" fill="#e6f2ea" text-anchor="middle">Pico W</text>']
    for side, names in (("L", PICO_B), ("R", PICO_T)):
        for i, name in enumerate(names):
            x, y = (24 if side == "L" else 126), 30 + 13 + i * 26
            on = filt and any(k == filt for k, _ in functions(name))
            ring = "#0f9b94" if on else "#d6b24c"
            o.append(f'<circle cx="{x}" cy="{y}" r="7" fill="{ring}" stroke="#a8862a"/><circle cx="{x}" cy="{y}" r="3" fill="#1b2b22"/>')
            if on:
                o.append(f'<circle cx="{x}" cy="{y}" r="11" fill="none" stroke="#0f9b94" stroke-width="2"/>')
    o.append("</svg>")
    return "".join(o)


# ---------------------------------------------------------------- examples library
EXAMPLES = [
    ("Blink", "The first program: an LED on and off every second", ["led", "resistor"], "micro:bit · Pico W · ESP32", 1, "Basics"),
    ("Traffic lights", "Three LEDs and a crossing button with a pull-up", ["led", "led", "button"], "micro:bit · Pico W · ESP32", 1, "Basics"),
    ("Dimmer", "A knob sets an LED's brightness with PWM", ["pot", "led"], "micro:bit · Pico W · ESP32", 2, "Basics"),
    ("Night light", "The LED comes on when it gets dark", ["ldr", "led", "resistor"], "micro:bit · Pico W · ESP32", 2, "Sensors"),
    ("Melody", "Play a tune on a passive buzzer", ["buzzer"], "micro:bit · Pico W · ESP32", 1, "Sound"),
    ("Servo sweep", "Turn a servo to 0°, 90° and 180°", ["servo"], "micro:bit · Pico W · ESP32", 2, "Actuators"),
    ("Distance meter", "HC-SR04 distance on an OLED screen", ["hcsr04", "oled"], "Pico W · ESP32", 3, "Sensors"),
    ("Weather station", "Temperature and humidity on a 16×2 LCD", ["dht", "lcd"], "Pico W · ESP32", 3, "Sensors"),
    ("Rainbow ring", "Colours chasing round a NeoPixel ring", ["neopixel"], "micro:bit · Pico W · ESP32", 2, "Displays"),
    ("Motion alarm", "A PIR sensor sounds the buzzer", ["pir", "buzzer"], "micro:bit · Pico W · ESP32", 2, "Sensors"),
    ("Heart & knob", "Buttons, shake and a knob on the micro:bit", ["microbit", "pot"], "micro:bit", 1, "micro:bit"),
    ("Plant waterer", "Soil moisture switches a relay pump", ["soil", "relay"], "Pico W · ESP32", 3, "Actuators"),
]


def examples() -> str:
    out = []
    for title, desc, kinds, boards, level, cat in EXAMPLES:
        art = "".join(icon_svg(k, "p") for k in kinds)
        bds = "".join(f"<span>{b.strip()}</span>" for b in boards.split("·"))
        lvl = "".join(f'<i class="{"on" if i < level else ""}"></i>' for i in range(3))
        out.append(f'<div class="card excard"><div class="art">{art}<span class="pill" style="position:absolute;left:8px;top:8px;background:#fff">{cat}</span></div>'
                   f'<div class="row" style="gap:6px"><b style="font-size:13.5px">{title}</b><span class="spacer"></span><span class="lvl" title="Level">{lvl}</span></div>'
                   f'<span class="small muted" style="line-height:1.4;min-height:17px">{desc}</span><div class="bd">{bds}</div></div>')
    return "".join(out)


# ---------------------------------------------------------------- template engine
GENERATORS = {"scene": scenes.scene, "code": code, "parts": parts, "part": part, "pinout": pinout, "picov": picov,
              "examples": examples}
TAG = re.compile(r"\{\{(include|i|" + "|".join(GENERATORS) + r")(?::([^}]*))?\}\}")


def render(text: str) -> str:
    def sub(m: re.Match) -> str:
        kind, args = m.group(1), (m.group(2).split(":") if m.group(2) else [])
        if kind == "include":
            return render((SRC / "partials" / f"{args[0]}.html").read_text())
        if kind == "i":
            return icon(*args)
        return GENERATORS[kind](*args)
    return TAG.sub(sub, text)


VAR_DEF = re.compile(r"<!--@([A-Z0-9_]+):(.*?)-->\n?", re.S)
VAR_USE = re.compile(r"\{\{([A-Z0-9_]+)\}\}")


def build_page(text: str) -> str:
    """Pages set per-screen variables with <!--@NAME: value-->; unset variables become empty."""
    variables = {k: v.strip() for k, v in VAR_DEF.findall(text)}
    variables.setdefault("PROJECT", "Traffic lights")
    variables.setdefault("PROJECT_SUB", "Pico W · saved 2 min ago")
    variables.setdefault("BOARD", "Raspberry Pi Pico W")
    variables.setdefault("BOARD_ICON", "pico")
    variables.setdefault("MODE_WS", "on")
    variables.setdefault("RUNBOX", "{{include:run-stopped}}")
    variables.setdefault("STATUS", '<span class="st"><span class="dot" style="background:var(--tx-3)"></span>Stopped</span>')
    variables.setdefault("FILES", '<a class="on">{{i:file:s14}} main.py</a>')
    variables.setdefault("BOARD_PIC", "{{part:pico:bp}}")
    variables.setdefault("PARTS_LIST", "{{parts}}")
    variables.setdefault("EDITOR", "{{code:traffic}}")
    variables.setdefault("CTABS", '<a class="on">{{i:term:s14}} Console</a><a>{{i:plot:s14}} Plotter</a><a>{{i:warn:s14}} Problems</a>')
    variables.setdefault("CONSOLE", '<div class="cbody"><span class="sys">Press Run to start the simulation. print() output and errors appear here.</span></div>'
                                    '<div class="prompt"><b>&gt;&gt;&gt;</b><span>REPL starts when the program ends</span></div>')
    variables.setdefault("COUNTS", "Pico W + 8 parts · 10 wires")
    variables.setdefault("STATUS_R", '<span class="row" style="gap:5px;color:var(--success)">{{i:check:s12}} Wiring check: no problems</span>')
    variables.setdefault("RUNTIME", "00:07")
    # real boards (M10 design): the board chip is new — the approved screens before 13 have none
    variables.setdefault("BOARDCHIP", "")
    variables.setdefault("SENDBTN", '<button class="btn">{{i:usb}} Send to board</button>')
    html_ = render(VAR_DEF.sub("", text))
    for _ in range(3):  # a variable's value can use other variables and tags
        html_ = VAR_USE.sub(lambda m: render(variables.get(m.group(1), "")), html_)
    return html_


def main() -> None:
    OUT.mkdir(exist_ok=True)
    shutil.copy(SRC / "styles.css", OUT / "styles.css")
    shutil.copy(SRC / "fit.js", OUT / "fit.js")
    for page in sorted(SRC.glob("*.html")):
        (OUT / page.name).write_text(build_page(page.read_text()))
        print("built", page.name)


if __name__ == "__main__":
    main()
