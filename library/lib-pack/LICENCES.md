# The library pack: licences

MicroLab ships these MicroPython drivers so the parts work offline (F-54). On the Pico W and the ESP32 each is a
driver people already use, as its authors wrote it — unchanged (`pack.json` keeps each file's SHA-256), with its
licence in its folder. *Add library* copies its files into the project's `lib/` with its licence as
`lib/LICENSE-<id>.txt`, so the notice goes onto the board with the code.

| Library | For | Licence | Authors | Source (commit) |
|---|---|---|---|---|
| `hcsr04` — HC-SR04 distance | hc-sr04 | Apache-2.0 | Roberto Sánchez | [rsc1975/micropython-hcsr04](https://github.com/rsc1975/micropython-hcsr04/tree/17eafe3730ce27a880ba45f4c4891efeb112bf82) (`17eafe3`) |
| `bmp280` — BMP280 air pressure | bmp280 | MIT | David Stenwall Wahlund | [dafvid/micropython-bmp280](https://github.com/dafvid/micropython-bmp280/tree/83dfdd6dff6382c7aff03138d32ae48d00ec729a) (`83dfdd6`) |
| `ds1302` — DS1302 clock | ds1302 | MIT | shaoziyang, Omar Benhamid | [omarbenhamid/micropython-ds1302-rtc](https://github.com/omarbenhamid/micropython-ds1302-rtc/tree/c2fc5a0462010f6eb983eb8795064b3b88642aab) (`c2fc5a0`) |
| `vl53l0x` — VL53L0X laser distance | vl53l0x | BSD-3-Clause | Kevin McAleer | [kevinmcaleer/vl53l0x](https://github.com/kevinmcaleer/vl53l0x/tree/d71ce30b0efaa4e45a771049056d8c9fdc2755ac) (`d71ce30`) |
| `mpu6050` — MPU6050 motion (imu) | mpu6050 | MIT | Peter Hinch, Sebastian Plamauer | [micropython-IMU/micropython-mpu9x50](https://github.com/micropython-IMU/micropython-mpu9x50/tree/ae68046e310224ebc3e196a1e3692de018991dbb) (`ae68046`) |
| `rotary` — Rotary encoder | rotary-encoder | MIT | Mike Teachman | [miketeachman/micropython-rotary](https://github.com/miketeachman/micropython-rotary/tree/b4c8ce53ee2413bdad41d24a2fcf91fac6ab2d32) (`b4c8ce5`) |
| `max30102` — MAX30102 pulse oximeter | max30102 | MIT | Nicola Elia (after SparkFun's MAX3010x library, BSD: its notice is kept in the file) | [n-elia/MAX30102-MicroPython-driver](https://github.com/n-elia/MAX30102-MicroPython-driver/tree/facf22299ade83a6bb000feb3ff832b61096e68a) (`facf222`) |
| `ssd1306` — SSD1306 OLED | ssd1306 | MIT | micropython-lib contributors (Damien P. George) | [micropython/micropython-lib](https://github.com/micropython/micropython-lib/tree/a08087249fda8a7994f7c54ccaad29fb9fcc448a) (`a080872`) — `micropython/drivers/display/ssd1306/ssd1306.py`; its `LICENSE` is the MIT section of micropython-lib's |
| `lcd` — 16×2 LCD (I²C) | lcd1602 | MIT | Dave Hylands | [dhylands/python_lcd](https://github.com/dhylands/python_lcd/tree/4294eed8ce340b7b87343775617ce929ce1de124) (`4294eed`) — `lcd/lcd_api.py` and `lcd/machine_i2c_lcd.py`, the second put in the project as `lib/i2c_lcd.py`, the name most tutorials use |
| `tm1637` — TM1637 4-digit display | tm1637 | MIT | Mike Causer | [mcauser/micropython-tm1637](https://github.com/mcauser/micropython-tm1637/tree/cc9ecc642787b0c8afcb318a52865b855b4f0e5f) (`cc9ecc6`) |
| `max7219` — MAX7219 8×8 dot matrix | max7219 | MIT | Mike Causer | [mcauser/micropython-max7219](https://github.com/mcauser/micropython-max7219/tree/29c22edfb9e6d47a0fb996a3deb141ab092b77ae) (`29c22ed`) |

**On the micro:bit** its MicroPython has no `machine.I2C` objects or numbered pins, so these drivers don't run
there. Each library has a small one of MicroLab's own instead (`<id>/microbit/`, MIT, © 2026 MicroLab, the notice in
the file itself — the micro:bit has about 20 KB for files), with the same calls on `microbit.i2c` and the pin
objects. The rotary encoder's reads the pins each time `value()` is called (the micro:bit has no pin interrupts);
it follows the state table of Mike Teachman's `micropython-rotary` (MIT).
The micro:bit's MicroPython has no `framebuf` either, so its `ssd1306` and `max7219` carry framebuf's drawing calls
in Python, with MicroPython's own 8×8 letters (`font_petme128_8x8.h`, MIT, © 2013, 2014 Damien P. George — the
notice in the file); its `lcd` is one file (`i2c_lcd.py`) with python_lcd's calls.

Part of MicroPython on the Pico W and the ESP32 (nothing to add): `dht` for dht; `onewire, ds18x20` for ds18b20.
