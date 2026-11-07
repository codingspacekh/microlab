import onewire, ds18x20, time
from machine import Pin

ds = ds18x20.DS18X20(onewire.OneWire(Pin(4)))   # the module has its 4.7 k pull-up
roms = ds.scan()
print('found', len(roms))
while True:
    ds.convert_temp()
    time.sleep_ms(750)                       # a 12-bit conversion takes 750 ms
    print('%.1f C' % ds.read_temp(roms[0]))
    time.sleep_ms(250)
