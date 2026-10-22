# Papan Panitia

## Deploy ke Netlify
Fungsi server (login & data bersama) butuh build, jadi JANGAN drag-and-drop folder. Pilih salah satu:
1. **GitHub**: upload folder ini ke repo -> Netlify > Add new site > Import from Git. Build command kosongkan, publish `public` (sudah di netlify.toml).
2. **CLI**: `npm i -g netlify-cli && npm install && netlify deploy --prod`

Data tersimpan otomatis di Netlify Blobs (tanpa database tambahan).

## Login awal
Kata sandi = nama huruf kecil + 123 (jers123, andra123, tika123, sarah123, batara123, vany123, desya123, rena123, fitrah123, aidil123).
Ganti lewat Site settings > Environment variables: PW_JERS, PW_ANDRA, PW_TIKA, PW_SARAH, PW_BATARA, PW_VANY, PW_DESYA, PW_RENA, PW_FITRAH, PW_AIDIL.

## Tes lokal
`npm install && netlify dev`

## Fitur & akses menu
- Task 2 tahap: panitia mengisi penanggung jawab dulu, baru upload bukti.
- Menu Keuangan (target Rp300.000, pemasukan/pengeluaran + nota): Sarah dan Jers.
- Menu Sponsor dan Bazar (target Rp10.000.000 dan Rp20.000.000): Desya dan Jers.
- Ubah siapa yang boleh akses di konstanta ACCESS pada netlify/functions/api.mjs (nilai target ada di FIN_TARGET dan BZ).
