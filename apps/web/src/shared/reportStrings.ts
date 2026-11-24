/** "Laporkan masalah": text players see, on the phones and on the main screen. */
import type { ReportKind } from '@hoorah/protocol';

export const REPORT_STR = {
  open: 'Laporkan masalah',
  title: 'Laporkan masalah',
  kindLabel: 'Tentang apa?',
  kinds: {
    teknis: 'Masalah teknis',
    pass: 'Pass dan pembayaran',
    saran: 'Saran',
    lainnya: 'Lainnya',
  } satisfies Record<ReportKind, string>,
  textLabel: 'Ceritakan masalahnya',
  textPlaceholder: 'Misalnya: HP tidak tersambung setelah game dimulai',
  counter: (n: number, max: number) => `${n}/${max}`,
  contactLabel: 'Kontak (boleh kosong)',
  contactPlaceholder: 'WhatsApp atau email',
  send: 'Kirim',
  sending: 'Mengirim…',
  cancel: 'Batal',
  close: 'Tutup',
  tooShort: 'Tulis minimal 3 huruf.',
  done: 'Terima kasih, laporanmu sudah terkirim',
  doneSub: 'Info HP dan room ikut terkirim, jadi kami bisa langsung memeriksanya.',
  errLimited: 'Terlalu banyak laporan. Coba lagi beberapa menit lagi.',
  errInvalid: 'Laporan belum bisa dikirim. Periksa isinya lalu coba lagi.',
  errFailed: 'Gagal mengirim. Periksa koneksi lalu coba lagi.',
  /* Main screen: typing on a big screen is hard, so the report is sent from a phone. */
  screenTitle: 'Ada masalah?',
  screenBody: 'Buka menu di HP lalu pilih Laporkan masalah',
  screenSub: 'Info layar ini dan room ikut terkirim otomatis, kamu cukup menulis ceritanya.',
} as const;
