# The library pack: licences

MicroLab ships these MicroPython drivers so the parts work offline (F-54). Each is as its authors wrote it,
unchanged (`pack.json` keeps each file's SHA-256), with its licence in its folder. *Add library* copies a
library's files into the project's `lib/` with its licence as `lib/LICENSE-<id>.txt`, so the notice goes onto
the board with the code.

| Library | For | Licence | Authors | Source (commit) |
|---|---|---|---|---|
| `hcsr04` — HC-SR04 distance | hc-sr04 | Apache-2.0 | Roberto Sánchez | [rsc1975/micropython-hcsr04](https://github.com/rsc1975/micropython-hcsr04/tree/17eafe3730ce27a880ba45f4c4891efeb112bf82) (`17eafe3`) |
| `bmp280` — BMP280 air pressure | bmp280 | MIT | David Stenwall Wahlund | [dafvid/micropython-bmp280](https://github.com/dafvid/micropython-bmp280/tree/83dfdd6dff6382c7aff03138d32ae48d00ec729a) (`83dfdd6`) |
| `ds1302` — DS1302 clock | ds1302 | MIT | shaoziyang, Omar Benhamid | [omarbenhamid/micropython-ds1302-rtc](https://github.com/omarbenhamid/micropython-ds1302-rtc/tree/c2fc5a0462010f6eb983eb8795064b3b88642aab) (`c2fc5a0`) |
| `vl53l0x` — VL53L0X laser distance | vl53l0x | BSD-3-Clause | Kevin McAleer | [kevinmcaleer/vl53l0x](https://github.com/kevinmcaleer/vl53l0x/tree/d71ce30b0efaa4e45a771049056d8c9fdc2755ac) (`d71ce30`) |
| `mpu6050` — MPU6050 motion (imu) | mpu6050 | MIT | Peter Hinch, Sebastian Plamauer | [micropython-IMU/micropython-mpu9x50](https://github.com/micropython-IMU/micropython-mpu9x50/tree/ae68046e310224ebc3e196a1e3692de018991dbb) (`ae68046`) |
| `rotary` — Rotary encoder | rotary-encoder | MIT | Mike Teachman | [miketeachman/micropython-rotary](https://github.com/miketeachman/micropython-rotary/tree/b4c8ce53ee2413bdad41d24a2fcf91fac6ab2d32) (`b4c8ce5`) |
| `max30102` — MAX30102 pulse oximeter | max30102 | MIT | Nicola Elia (after SparkFun's MAX3010x library, BSD: its notice is kept in the file) | [n-elia/MAX30102-MicroPython-driver](https://github.com/n-elia/MAX30102-MicroPython-driver/tree/facf22299ade83a6bb000feb3ff832b61096e68a) (`facf222`) |

Part of MicroPython on the Pico W and the ESP32 (nothing to add): `dht` for dht; `onewire, ds18x20` for ds18b20.
The micro:bit's MicroPython has no `machine.I2C` objects or `machine.Pin` numbers, so these drivers don't run on it; its
examples talk to the parts with `microbit.i2c` and the pins directly.
