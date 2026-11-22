/**
 * Juara Eja word bank, written for this game: family-friendly words with short definitions in our
 * own words (nothing copied from a dictionary). Each line is `word|definition`; words are
 * lowercase a-z only. Three tiers per language: 1 Mudah (everyday, short), 2 Sedang (longer or
 * less common), 3 Sulit (long words and spellings people often get wrong). `WORDS` parses and
 * validates the lists once.
 */

export type Lang = 'id' | 'en';
export type Tier = 1 | 2 | 3;

export interface EjaWord {
  word: string;
  def: string;
  tier: Tier;
}

const ID_1 = `
buku|Lembaran kertas berjilid berisi tulisan untuk dibaca.
meja|Perabot berkaki dengan permukaan datar untuk menaruh barang.
kursi|Tempat duduk berkaki, biasanya ada sandarannya.
pintu|Papan yang dibuka dan ditutup untuk keluar masuk ruangan.
bola|Benda bulat yang ditendang atau dilempar saat bermain.
kucing|Hewan peliharaan berbulu halus yang suka mengeong.
ikan|Hewan yang hidup di air dan bernapas dengan insang.
rumah|Bangunan tempat sebuah keluarga tinggal.
nasi|Beras yang sudah dimasak, makanan pokok sehari-hari.
susu|Minuman putih dari sapi atau kambing.
gigi|Bagian keras di dalam mulut untuk mengunyah.
mata|Bagian tubuh untuk melihat.
kaki|Bagian tubuh untuk berjalan dan berlari.
tangan|Bagian tubuh dari bahu sampai jari untuk memegang.
bulan|Benda langit yang bersinar pada malam hari.
hujan|Air yang jatuh dari awan ke bumi.
pohon|Tumbuhan besar berbatang kayu dan berdaun lebat.
bunga|Bagian tumbuhan yang berwarna indah dan sering harum.
sapi|Hewan ternak besar yang diperah susunya.
ayam|Unggas yang berkokok pada pagi hari.
telur|Benda bercangkang yang dihasilkan ayam atau burung.
roti|Makanan dari tepung terigu yang dipanggang.
apel|Buah bulat berkulit merah atau hijau yang renyah.
jeruk|Buah berkulit oranye yang segar dan agak asam.
pisang|Buah panjang berkulit kuning yang disukai monyet.
topi|Penutup kepala untuk melindungi dari panas.
baju|Pakaian yang menutupi badan bagian atas.
sepatu|Alas kaki tertutup yang dipakai saat bepergian.
tas|Wadah bertali untuk membawa barang ke mana-mana.
jam|Alat penunjuk waktu.
kunci|Alat kecil untuk membuka dan menutup gembok.
lampu|Alat yang memancarkan cahaya saat gelap.
sendok|Alat makan berbentuk cekung untuk menyuap.
piring|Wadah datar tempat menaruh makanan.
gelas|Wadah untuk minum air atau teh.
sabun|Bahan pembersih yang berbusa saat digosok dengan air.
handuk|Kain tebal untuk mengeringkan badan setelah mandi.
kasur|Alas tidur yang empuk.
bantal|Alas kepala yang empuk saat tidur.
awan|Kumpulan uap air yang melayang di langit.
laut|Perairan asin yang sangat luas.
gunung|Tanah yang menjulang sangat tinggi.
sungai|Aliran air yang panjang menuju laut.
pasir|Butiran halus di pantai atau gurun.
batu|Benda keras dari dalam tanah.
api|Nyala panas yang bisa membakar.
angin|Udara yang bergerak.
burung|Hewan bersayap dan berbulu yang bisa terbang.
kuda|Hewan berkaki empat yang bisa ditunggangi dan berlari kencang.
gajah|Hewan sangat besar berbelalai panjang.
semut|Serangga kecil yang hidup berkelompok dan suka gula.
katak|Hewan pelompat yang hidup di air dan di darat.
bebek|Unggas berparuh pipih yang pandai berenang.
kambing|Hewan ternak berjanggut yang suka makan rumput.
mobil|Kendaraan beroda empat bermesin.
sepeda|Kendaraan beroda dua yang dikayuh.
kapal|Kendaraan besar yang berlayar mengarungi samudra.
kereta|Kendaraan panjang yang berjalan di atas rel.
jalan|Tempat lalu lintas orang dan kendaraan.
pasar|Tempat orang berjual beli.
sekolah|Tempat anak-anak belajar bersama guru.
guru|Orang yang mengajar di kelas.
dokter|Orang yang memeriksa dan mengobati orang sakit.
pensil|Alat tulis dari kayu yang tulisannya bisa dihapus.
kertas|Lembaran tipis untuk menulis atau menggambar.
merah|Warna seperti darah atau cabai matang.
biru|Warna langit yang cerah.
hijau|Warna daun muda.
kuning|Warna kunyit atau pisang matang.
putih|Warna susu dan kapas.
manis|Rasa seperti gula.
asin|Rasa seperti garam.
pedas|Rasa panas di lidah seperti cabai.
dingin|Bersuhu rendah, seperti es.
panas|Bersuhu tinggi, seperti terik matahari siang.
senang|Perasaan gembira dan puas.
tidur|Beristirahat dengan mata terpejam.
mandi|Membersihkan badan dengan air.
minum|Memasukkan air ke mulut lalu menelannya.
`;

const ID_2 = `
jendela|Lubang berbingkai di dinding untuk masuk cahaya dan udara.
lemari|Perabot tinggi berpintu untuk menyimpan pakaian.
payung|Pelindung dari hujan atau terik yang bisa dilipat.
jembatan|Bangunan penghubung di atas sungai atau jurang.
pelangi|Lengkung warna-warni di langit setelah hujan.
matahari|Bintang yang menyinari bumi pada siang hari.
bintang|Titik cahaya yang berkelip di langit malam.
kelinci|Hewan bertelinga panjang yang suka wortel.
harimau|Kucing besar belang yang hidup di hutan.
jerapah|Hewan berleher sangat panjang dari Afrika.
kerbau|Hewan bertanduk yang suka berkubang dan membajak sawah.
penyu|Kura-kura laut yang bertelur di pantai.
cicak|Hewan kecil yang merayap di dinding dan memangsa nyamuk.
nyamuk|Serangga kecil yang menggigit dan berdengung di telinga.
kelelawar|Hewan bersayap selaput yang aktif pada malam hari.
durian|Buah berduri tajam dengan bau yang sangat kuat.
semangka|Buah besar berkulit hijau, isinya merah dan berair.
mangga|Buah berdaging kuning yang manis saat matang.
rambutan|Buah berkulit merah berbulu, isinya putih dan manis.
kelapa|Buah berkulit keras dengan air segar di dalamnya.
jagung|Tanaman berbiji kuning yang tersusun pada tongkol.
wortel|Sayuran akar berwarna oranye.
bayam|Sayuran berdaun hijau yang lembut.
tomat|Buah merah berair yang sering dijadikan saus.
bawang|Umbi berlapis yang membuat mata pedih saat diiris.
kerupuk|Makanan renyah dari adonan tepung yang digoreng.
sambal|Ulekan cabai yang pedas sebagai teman makan.
bakso|Bola daging kenyal yang disajikan dengan kuah.
martabak|Kue dadar tebal berisi manis atau telur, dijual malam hari.
dapur|Ruangan tempat memasak.
halaman|Tanah lapang di sekitar rumah.
taman|Tempat bertanam bunga dan bermain.
kebun|Tanah tempat menanam sayur atau buah.
sawah|Lahan berair tempat menanam padi.
hutan|Daerah luas yang ditumbuhi banyak pohon.
pantai|Tepi laut yang berpasir.
pulau|Daratan yang dikelilingi air.
gurun|Daerah sangat kering dan berpasir.
kota|Daerah ramai dengan banyak gedung dan penduduk.
desa|Permukiman kecil yang dikelilingi sawah atau ladang.
pesawat|Kendaraan bersayap yang terbang di udara.
perahu|Kendaraan air kecil yang didayung.
polisi|Petugas yang menjaga keamanan dan ketertiban.
petani|Orang yang bekerja menanam di sawah atau ladang.
nelayan|Orang yang mencari ikan di laut.
koki|Juru masak di restoran.
pilot|Orang yang menerbangkan pesawat.
tukang|Orang yang ahli membuat atau memperbaiki sesuatu.
gitar|Alat musik berdawai yang dipetik.
gendang|Alat musik berkulit yang dipukul dengan tangan.
suling|Alat musik tiup dari bambu.
boneka|Mainan berbentuk orang atau hewan.
layangan|Mainan kertas yang diterbangkan dengan benang.
kelereng|Bola kaca kecil untuk dimainkan anak-anak.
ayunan|Tempat duduk bergantung yang bisa digoyang maju mundur.
cermin|Kaca yang memantulkan bayangan.
sisir|Alat bergerigi untuk merapikan rambut.
selimut|Kain tebal untuk menghangatkan badan saat tidur.
kompor|Alat untuk memasak dengan nyala api.
kulkas|Lemari dingin untuk menyimpan makanan.
telepon|Alat untuk berbicara dengan orang yang jauh.
surat|Tulisan yang dikirim kepada orang lain.
hadiah|Barang pemberian untuk orang lain.
pesta|Acara makan dan bergembira bersama.
libur|Hari tidak bekerja atau tidak sekolah.
cuaca|Keadaan udara pada suatu waktu, misalnya cerah atau mendung.
petir|Kilatan cahaya dan bunyi keras saat badai.
gempa|Guncangan tanah dari dalam bumi.
banjir|Air yang meluap dan menggenangi daratan.
embun|Titik air di daun pada pagi hari.
kabut|Uap air tebal di dekat tanah yang menghalangi pandangan.
berani|Tidak takut menghadapi bahaya.
rajin|Suka bekerja dan belajar dengan tekun.
jujur|Berkata apa adanya, tidak berbohong.
sabar|Tenang dan tidak mudah marah.
lapar|Ingin makan karena perut kosong.
haus|Ingin minum karena tenggorokan kering.
bersih|Tidak kotor sama sekali.
tetangga|Orang yang rumahnya di dekat rumah kita.
sahabat|Teman yang sangat dekat.
keluarga|Ayah, ibu, dan anak-anak yang tinggal bersama.
nenek|Ibu dari ayah atau ibu kita.
kakek|Ayah dari ayah atau ibu kita.
nanas|Buah bermahkota daun dengan kulit bersisik.
kerang|Hewan laut bercangkang dua.
komodo|Kadal raksasa dari Nusa Tenggara Timur.
lahar|Aliran lumpur panas dari gunung berapi.
`;

const ID_3 = `
angklung|Alat musik dari bambu yang dibunyikan dengan digoyangkan.
helikopter|Pesawat dengan baling-baling besar di atasnya.
ambulans|Mobil yang mengantar orang sakit ke rumah sakit.
televisi|Kotak bergambar untuk menonton siaran.
perpustakaan|Tempat menyimpan banyak buku untuk dipinjam dan dibaca.
kalender|Daftar hari, minggu, dan bulan dalam setahun.
komputer|Mesin elektronik untuk mengolah data dan bermain gim.
termometer|Alat untuk mengukur suhu.
teleskop|Alat untuk melihat benda langit yang jauh.
mikroskop|Alat untuk melihat benda yang sangat kecil.
kanguru|Hewan Australia yang melompat dan membawa anaknya di kantong.
dinosaurus|Hewan purba raksasa yang sudah punah.
orangutan|Kera besar berbulu cokelat kemerahan dari Kalimantan dan Sumatra.
cenderawasih|Burung berbulu sangat indah dari Papua.
kakatua|Burung berjambul yang pandai menirukan suara.
trenggiling|Hewan bersisik keras yang menggulung tubuhnya saat takut.
jangkrik|Serangga yang berderik pada malam hari.
belalang|Serangga hijau berkaki panjang yang pandai melompat.
kepiting|Hewan bercangkang yang berjalan menyamping.
gurita|Hewan laut berlengan delapan.
stroberi|Buah merah kecil berbintik, rasanya manis asam.
alpukat|Buah berdaging hijau lembut seperti mentega.
belimbing|Buah kuning yang bila diiris berbentuk bintang.
kedondong|Buah hijau asam yang bijinya berserat dan berduri.
sirsak|Buah hijau berduri lunak, dagingnya putih.
kemangi|Daun harum yang dimakan sebagai lalapan.
cokelat|Makanan manis dari biji kakao.
rendang|Masakan daging bersantan yang dimasak lama sampai kering, khas Minangkabau.
gudeg|Masakan nangka muda yang manis, khas Yogyakarta.
klepon|Kue bola hijau berisi gula merah, ditaburi kelapa parut.
lemper|Ketan berisi ayam yang dibungkus daun pisang.
serabi|Kue dadar dari tepung beras yang dimasak di tungku kecil.
pempek|Makanan dari ikan dan sagu khas Palembang, dimakan dengan kuah cuka.
wayang|Boneka pipih untuk pertunjukan cerita yang dimainkan dalang.
gamelan|Seperangkat alat musik tradisional Jawa dan Bali.
batik|Kain bergambar yang dibuat dengan lilin malam.
kentongan|Alat bunyi dari bambu atau kayu yang dipukul sebagai tanda.
jamu|Minuman dari tumbuhan yang dipercaya menyehatkan.
kacamata|Lensa berbingkai untuk membantu penglihatan.
stetoskop|Alat dokter untuk mendengar detak jantung.
ensiklopedia|Buku tebal berisi pengetahuan dari banyak bidang.
kamus|Buku daftar kata beserta artinya.
jadwal|Daftar kegiatan beserta waktunya.
apotek|Toko yang menjual obat.
praktik|Melakukan langsung apa yang sudah dipelajari.
kualitas|Mutu atau baik buruknya sesuatu.
februari|Bulan kedua dalam setahun.
november|Bulan kesebelas dalam setahun.
jumat|Hari sebelum Sabtu.
kuitansi|Tanda bukti pembayaran.
risiko|Kemungkinan buruk yang bisa terjadi.
sistem|Cara yang teratur untuk mengerjakan sesuatu.
objek|Benda atau hal yang menjadi sasaran.
nasihat|Saran baik dari orang lain.
izin|Persetujuan untuk melakukan sesuatu.
ijazah|Surat tanda tamat belajar.
atlet|Olahragawan yang ikut bertanding.
karier|Perjalanan pekerjaan seseorang.
sekadar|Hanya seperlunya saja.
silakan|Kata sopan untuk menawarkan orang lain melakukan sesuatu.
analisis|Penyelidikan untuk mengetahui keadaan sebenarnya.
teknologi|Ilmu dan alat yang memudahkan pekerjaan manusia.
bioskop|Gedung untuk menonton film.
museum|Gedung tempat menyimpan benda bersejarah.
akuarium|Kolam kaca untuk memelihara ikan.
astronaut|Orang yang terbang ke luar angkasa.
planet|Benda langit yang mengelilingi matahari.
satelit|Benda yang beredar mengelilingi sebuah planet.
khatulistiwa|Garis khayal yang membagi bumi menjadi belahan utara dan selatan.
nusantara|Sebutan untuk seluruh kepulauan Indonesia.
pahlawan|Orang yang berjasa besar dan berani membela kebenaran.
proklamasi|Pengumuman resmi kemerdekaan Indonesia pada tahun 1945.
xilofon|Alat musik berbilah yang dipukul dengan pemukul kecil.
zebra|Hewan seperti kuda dengan belang hitam putih.
yoyo|Mainan bulat bertali yang naik turun.
vitamin|Zat penting dalam makanan agar tubuh sehat.
kuliner|Segala hal tentang masakan dan makanan.
ekskavator|Alat berat untuk menggali tanah.
matematika|Pelajaran tentang angka dan hitungan.
geografi|Pelajaran tentang bumi, peta, dan negara.
`;

const EN_1 = `
cat|A small furry pet that purrs and says meow.
dog|A loyal pet that barks and wags its tail.
fish|An animal that lives in water and swims with fins.
bird|An animal with feathers and wings that can fly.
cow|A farm animal that gives us milk.
duck|A water bird with a flat beak that quacks.
frog|A small green animal that jumps and croaks.
horse|A large animal people can ride.
lion|A big wild cat with a mane, called king of the jungle.
bear|A big furry animal that loves honey.
apple|A round red or green fruit that crunches.
banana|A long yellow fruit you peel before eating.
grape|A small round fruit that grows in bunches.
lemon|A sour yellow fruit.
bread|Food baked from flour, often sliced for sandwiches.
milk|A white drink that comes from cows.
egg|An oval thing laid by hens, often fried or boiled.
rice|Small white grains cooked as a main food in Asia.
cake|A sweet baked treat for birthdays.
juice|A drink squeezed from fruit.
water|The clear liquid we drink every day.
book|Pages bound together for reading.
pen|A tool for writing with ink.
desk|A table where you study or work.
chair|A seat with legs and a back.
door|It opens and closes to let you into a room.
house|A building where a family lives.
bed|The furniture you sleep on.
lamp|A thing that gives light in a room.
clock|It shows the time.
ball|A round toy you kick or throw.
kite|A toy that flies in the wind on a long string.
doll|A toy that looks like a small person.
hat|Something you wear on your head.
shoe|You wear it on your foot when you go out.
sock|A soft cover for your foot, worn inside a sneaker.
shirt|Clothing for the top half of your body.
sun|The bright star that lights up the day.
moon|It shines in the night sky and changes shape.
star|A tiny twinkling light in the night sky.
rain|Water that falls from the clouds.
snow|Cold white flakes that fall in winter.
tree|A tall plant with a trunk, branches and leaves.
flower|The colorful part of a plant that often smells sweet.
grass|Thin green plants that cover a lawn.
sea|A huge area of salty water.
river|Water that flows across the land to the ocean.
hill|A small mountain.
sand|Tiny grains found on a beach.
car|A vehicle with four wheels and an engine.
bus|A big vehicle that carries many passengers.
boat|A small vessel that floats on water.
train|A long vehicle that runs on rails.
bike|Two wheels and pedals; you ride it.
red|The color of ripe strawberries.
blue|The color of a clear sky.
green|The color of fresh leaves.
yellow|The color of a banana.
happy|Feeling good and glad.
sad|Feeling unhappy; you might cry.
big|Large in size.
small|Little; not large.
hot|Very warm, like fire.
cold|Very cool, like ice.
fast|Moving very quickly.
jump|To push off the ground into the air.
run|To move faster than walking.
sing|To make music with your voice.
swim|To move through water using arms and legs.
sleep|To rest at night with your eyes closed.
smile|A happy look made with your mouth.
hand|The part of your arm with fingers.
nose|The part of your face you smell with.
ear|One of the two parts of your head used for listening.
eye|The part of your face you see with.
mouth|The part of your face for eating and talking.
teeth|Hard white things in your mouth for chewing.
mother|A woman who has children; mom.
school|A place where children go to learn.
teacher|A person who helps students learn.
drum|A musical instrument you hit with sticks.
`;

const EN_2 = `
rabbit|A small animal with long ears that hops.
monkey|A playful animal that climbs trees and loves bananas.
turtle|A slow animal with a hard shell.
tiger|A big wild cat with orange fur and black stripes.
zebra|An animal like a horse with black and white stripes.
giraffe|The tallest animal, with a very long neck.
elephant|A huge gray animal with a trunk.
penguin|A black and white bird that swims but cannot fly.
dolphin|A smart sea animal that jumps and clicks.
octopus|A sea animal with eight arms.
spider|A small creature with eight legs that spins webs.
butterfly|An insect with big colorful wings.
parrot|A colorful bird that can copy words.
chicken|A farm bird that lays eggs.
carrot|An orange root vegetable that rabbits love.
potato|A vegetable that grows underground and is used for fries.
tomato|A juicy red fruit used in salads and sauces.
onion|A vegetable with layers that can make you cry.
pumpkin|A large orange vegetable that is carved into lanterns.
cheese|Food made from milk, often yellow.
cookie|A small sweet baked biscuit.
sandwich|Two slices of bread with a filling between them.
pizza|A flat round bread baked with sauce and cheese.
noodle|A long thin strip of dough, often eaten in soup.
honey|A sweet golden food made by bees.
window|An opening in a wall with glass to let in light.
kitchen|The room where food is cooked.
garden|A place where flowers and vegetables grow.
bridge|A structure that lets you cross over a river.
castle|A large old stone building where kings and queens lived.
forest|A large area full of trees.
desert|A very dry, sandy place with little rain.
mountain|A very high hill.
ocean|The huge body of salt water covering most of Earth.
rainbow|A colorful arc in the sky after rain.
thunder|The loud rumble after lightning.
cloud|A white or gray shape floating in the sky.
winter|The coldest season of the year.
summer|The warmest season of the year.
pencil|A wooden writing tool whose marks you can erase.
eraser|A small rubber block that removes pencil marks.
picture|A drawing, painting or photo.
letter|A message written on paper and sent by post.
present|A gift you give someone.
party|A fun gathering to celebrate something.
birthday|The day each year you celebrate being born.
holiday|A day off from school or work.
guitar|A musical instrument with strings that you strum.
piano|A large instrument with black and white keys.
violin|A small string instrument played with a bow.
doctor|A person who helps sick people get better.
farmer|A person who grows crops or raises animals.
pilot|A person who flies a plane.
police|People whose job is to keep everyone safe.
dentist|A doctor who takes care of teeth.
brother|A boy who has the same parents as you.
sister|A girl who has the same parents as you.
family|Parents and their children.
village|A small group of houses in the countryside.
market|A place where people buy and sell things.
library|A place full of books you can borrow.
hospital|A building where sick people are cared for.
airport|A place where planes take off and land.
rocket|A vehicle that blasts off into space.
planet|A large round object that travels around a star.
helmet|A hard hat that protects your head.
blanket|A warm cover for your bed.
pillow|A soft cushion for your head in bed.
mirror|A glass that shows your reflection.
brave|Not afraid of danger.
honest|Always telling the truth.
quiet|Making little or no noise.
hungry|Wanting to eat.
thirsty|Wanting to drink.
clean|Not dirty.
laugh|The sound you make when something is funny.
whisper|To speak very softly.
travel|To go from one place to another, often far away.
bottle|A container with a narrow neck for liquids.
basket|A container woven from thin sticks, used for carrying things.
umbrella|Something you hold over your head to stay dry when it pours.
friend|Someone you like and enjoy spending time with.
`;

const EN_3 = `
squirrel|A small furry animal with a bushy tail that collects nuts.
scissors|A tool with two blades for cutting paper.
knight|A soldier in armor who served a king long ago.
knife|A tool with a sharp blade for cutting food.
knee|The joint in the middle of your leg.
knock|To tap on a door to let someone know you are there.
wrist|The joint between your hand and your arm.
answer|A reply to a question.
island|Land with water all around it.
listen|To pay attention to sounds.
because|A word that gives a reason.
beautiful|Very pretty to look at.
believe|To think something is true.
calendar|A chart showing the days, weeks and months of a year.
chocolate|A sweet brown treat made from cocoa beans.
dinosaur|A giant reptile that lived millions of years ago.
february|The second month of the year.
wednesday|The day in the middle of the week.
tomorrow|The day after today.
necessary|Needed; you must have it.
separate|To pull things apart.
different|Not the same.
favorite|The one you like best.
neighbor|Someone who lives next door.
enough|As much as you need.
through|In one side and out the other.
thought|An idea in your mind.
daughter|A girl child of a parent.
weather|The sun, rain, wind and temperature outside.
vegetable|A plant part eaten as food, like a carrot or a bean.
breakfast|The first meal of the day.
restaurant|A place where you pay to eat meals.
science|The study of how the world works.
history|The study of the past.
question|Something you ask to find out an answer.
special|Different from the usual and important.
surprise|Something that happens that you did not expect.
treasure|Gold, jewels and other valuable things.
adventure|An exciting journey.
astronaut|A person who travels into space.
telescope|A tool for seeing faraway stars.
microscope|A tool that makes tiny things look bigger.
thermometer|A tool that measures how hot or cold something is.
xylophone|A musical instrument with wooden bars you hit.
crocodile|A large reptile with strong jaws that lives in rivers.
kangaroo|An Australian animal that hops and carries its baby in a pouch.
hippopotamus|A huge African animal that spends most of the day in rivers.
caterpillar|A small crawling creature that becomes a butterfly.
mosquito|A small flying insect that bites and buzzes.
pajamas|Comfy clothes you wear to bed.
yacht|A fancy boat with sails or a motor.
rhythm|A strong regular pattern of beats in music.
receipt|A paper showing what you paid for.
choir|A group of people who sing together.
ghost|A spooky spirit from stories.
whistle|A small instrument that makes a high sound when you blow it.
gnome|A tiny bearded garden figure from fairy tales.
guess|To give an answer without knowing for sure.
guard|A person who watches over a place.
height|How tall something is.
eight|The number after seven.
lettuce|A leafy green vegetable used in salads.
broccoli|A green vegetable that looks like a little tree.
cucumber|A long green vegetable with a cool, crunchy inside.
spaghetti|Long thin pasta often served with tomato sauce.
avocado|A green fruit with a big seed and a creamy inside.
pineapple|A spiky tropical fruit with sweet yellow flesh.
strawberry|A red fruit with tiny seeds on the outside.
encyclopedia|A big book of facts about many subjects.
dictionary|A book that lists words and their meanings.
temperature|How hot or cold something is.
environment|The natural world around us.
museum|A building where old and interesting things are shown.
orchestra|A large group of musicians playing together.
journey|A trip from one place to another.
language|The words people use to speak and write.
knowledge|What you know and have learned.
`;

/** Clean a typed or listed word: lowercase letters a-z only. */
export function normalizeWord(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function parse(text: string, tier: Tier): EjaWord[] {
  const out: EjaWord[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bar = trimmed.indexOf('|');
    if (bar <= 0) continue;
    const word = normalizeWord(trimmed.slice(0, bar));
    const def = trimmed.slice(bar + 1).trim();
    if (word.length < 3 || !def) continue;
    out.push({ word, def, tier });
  }
  return out;
}

/** Drop a repeated word (first one wins), so a slip in the lists never deals the same word twice. */
function unique(list: EjaWord[]): EjaWord[] {
  const seen = new Set<string>();
  return list.filter((w) => {
    if (seen.has(w.word)) return false;
    seen.add(w.word);
    return true;
  });
}

export const RAW_WORDS: Readonly<Record<Lang, readonly EjaWord[]>> = {
  id: [...parse(ID_1, 1), ...parse(ID_2, 2), ...parse(ID_3, 3)],
  en: [...parse(EN_1, 1), ...parse(EN_2, 2), ...parse(EN_3, 3)],
};

export const WORDS: Readonly<Record<Lang, readonly EjaWord[]>> = {
  id: unique([...RAW_WORDS.id]),
  en: unique([...RAW_WORDS.en]),
};

export const wordKey = (lang: Lang, w: EjaWord): string => `${lang}:${w.word}`;
