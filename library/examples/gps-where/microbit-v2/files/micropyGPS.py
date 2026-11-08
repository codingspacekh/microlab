# micropyGPS for the micro:bit (MicroLab): Calvin McCoy's micropyGPS calls for a NEO-6M's RMC and GGA.
# MIT License. Copyright (c) 2026 MicroLab. Permission is granted to use, copy, modify and share this file, with
# this notice, without warranty (the MIT licence, https://opensource.org/licenses/MIT).
class MicropyGPS:
    def __init__(self, local_offset=0, location_formatting='ddm'):
        self.local_offset = local_offset
        self.coord_format = location_formatting
        self.sentence_active = False
        self.gps_segments = []
        self.crc_xor = 0
        self.process_crc = False
        self.clean_sentences = self.parsed_sentences = self.crc_fails = 0
        self.timestamp = [0, 0, 0.0]
        self.date = [0, 0, 0]
        self._latitude = [0, 0.0, 'N']
        self._longitude = [0, 0.0, 'W']
        self.speed = [0.0, 0.0, 0.0]
        self.altitude = self.hdop = 0.0
        self.satellites_in_use = self.fix_stat = 0
        self.valid = False

    def _coord(self, c):
        if self.coord_format == 'dd':
            return [c[0] + c[1] / 60, c[2]]
        return c

    @property
    def latitude(self):
        return self._coord(self._latitude)

    @property
    def longitude(self):
        return self._coord(self._longitude)

    def _time(self, s):
        if s:
            self.timestamp = [(int(s[0:2]) + self.local_offset) % 24, int(s[2:4]), float(s[4:])]

    def _place(self, lat, ns, lon, ew):
        self._latitude = [int(lat[0:2]), float(lat[2:]), ns]
        self._longitude = [int(lon[0:3]), float(lon[3:]), ew]

    def gprmc(self):
        s = self.gps_segments
        try:
            self._time(s[1])
            if s[9]:
                self.date = [int(s[9][0:2]), int(s[9][2:4]), int(s[9][4:6])]
            if s[2] != 'A':
                self.valid = False
                return True
            self._place(s[3], s[4], s[5], s[6])
            k = float(s[7])
            self.speed = [k, k * 1.151, k * 1.852]
            self.valid = True
        except Exception:
            return False
        return True

    def gpgga(self):
        s = self.gps_segments
        try:
            self._time(s[1])
            self.fix_stat = int(s[6])
            self.satellites_in_use = int(s[7])
            self.hdop = float(s[8])
            if self.fix_stat:
                self._place(s[2], s[3], s[4], s[5])
                self.altitude = float(s[9])
        except Exception:
            return False
        return True

    _SENTENCES = {'GPRMC': gprmc, 'GNRMC': gprmc, 'GPGGA': gpgga, 'GNGGA': gpgga}

    def update(self, new_char):
        c = ord(new_char)
        if not 10 <= c <= 126:
            return None
        if new_char == '$':
            self.sentence_active, self.gps_segments, self.crc_xor, self.process_crc = 1, [''], 0, 1
            return None
        if not self.sentence_active:
            return None
        valid = False
        if new_char == '*':
            self.process_crc = False
            self.gps_segments.append('')
            return None
        if new_char == ',':
            self.gps_segments.append('')
        else:
            self.gps_segments[-1] += new_char
            if not self.process_crc and len(self.gps_segments[-1]) == 2:
                try:
                    valid = int(self.gps_segments[-1], 16) == self.crc_xor
                    if not valid:
                        self.crc_fails += 1
                except ValueError:
                    pass
        if self.process_crc:
            self.crc_xor ^= c
        if valid:
            self.clean_sentences += 1
            self.sentence_active = False
            f = self._SENTENCES.get(self.gps_segments[0])
            if f and f(self):
                self.parsed_sentences += 1
                return self.gps_segments[0]
        if len(self.gps_segments) > 24:
            self.sentence_active = False
        return None

    def latitude_string(self):
        return '%d° %s\' %s' % tuple(self._latitude)

    def longitude_string(self):
        return '%d° %s\' %s' % tuple(self._longitude)
