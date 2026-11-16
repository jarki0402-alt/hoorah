/** Main-screen text for the Hoorah Pass (trial stage: a shared code from the Hoorah owner). */
export const STR = {
  passOn: (seats: number) => `Hoorah Pass aktif! Room bisa sampai ${seats} pemain`,
  passOff: 'Hoorah Pass sudah berakhir. Pemain yang sudah masuk tetap main.',
  passChip: (until: string) => `Pass sampai ${until}`,
  seatsFull: (used: number, max: number) =>
    `Room penuh (${used}/${max}). Punya kode Hoorah Pass? Ketik di HP yang mau ikut.`,
  seatsPass: (used: number, max: number, until: string) =>
    `Kursi terisi ${used}/${max}. Hoorah Pass aktif sampai ${until}.`,
};
