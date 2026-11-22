/**
 * Word pairs for Penyusup, written for this game (family friendly, no brands). Each pair holds two
 * words close enough that a clue for one could fit the other: the majority gets one word, the
 * impostor the other. `easy` pairs are further apart, so the first ronde is gentle.
 *
 * Words use letters and single spaces only (Si Kosong types a guess on the phone's A–Z keyboard)
 * and stay short enough for the big card on the phone.
 */

export type Lang = 'id' | 'en';

export interface WordPair {
  a: string;
  b: string;
  easy: boolean;
}

/** "Kopi|Teh" items separated by commas or new lines. */
function parse(list: string, easy: boolean): WordPair[] {
  return list
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const [a = '', b = ''] = item.split('|').map((w) => w.trim());
      return { a, b, easy };
    });
}

const ID_EASY = `
  Kopi|Teh, Pantai|Danau, Kucing|Anjing, Sepeda|Motor, Pensil|Pulpen, Sendok|Garpu,
  Sepatu|Sandal, Matahari|Bulan, Pesawat|Helikopter, Kereta|Bus, Pizza|Burger, Gitar|Biola,
  Harimau|Singa, Gajah|Badak, Kuda|Zebra, Ayam|Bebek, Semut|Rayap, Ikan Hiu|Lumba Lumba,
  Monyet|Orangutan, Kelinci|Hamster, Jerapah|Unta, Panda|Koala, Pinguin|Angsa, Gunung|Bukit,
  Sekolah|Kampus, Bioskop|Teater, Bandara|Stasiun, Sungai|Air Terjun, Dapur|Kamar Mandi,
  Desa|Kota, Kapal|Perahu, Becak|Bajaj, Roket|Satelit, Bantal|Guling, Kursi|Sofa, Lampu|Lilin,
  Payung|Jas Hujan, Sikat Gigi|Sisir, Sabun|Sampo, Televisi|Radio, Gunting|Pisau, Piring|Mangkuk,
  Kunci|Gembok, Tas|Dompet, Celana|Rok, Topi|Helm, Bulu Tangkis|Tenis, Basket|Voli,
  Renang|Menyelam, Drum|Kendang, Menyanyi|Menari, Dokter|Perawat, Guru|Dosen, Koki|Pelayan,
  Petani|Nelayan, Bintang|Komet, Pagi|Sore, Ulang Tahun|Arisan, Komputer|Laptop, Naga|Dinosaurus,
  Bajak Laut|Ninja, Semangka|Melon, Mangga|Pepaya, Tempe|Tahu, Garam|Gula, Tomat|Wortel,
  Kambing|Domba, Lebah|Tawon, Kebun Binatang|Taman Safari, Pasar|Swalayan, Hutan|Kebun,
  Robot|Boneka, Kamera|Proyektor, Raja|Pangeran, Pelangi|Awan, Gurita|Cumi Cumi
`;

const ID_HARD = `
  Bakso|Mi Ayam, Nasi Goreng|Mi Goreng, Sate|Gulai, Rendang|Opor, Martabak|Roti Bakar,
  Es Teh|Es Jeruk, Gado Gado|Pecel, Soto|Rawon, Pisang Goreng|Ubi Goreng, Keripik|Kerupuk,
  Susu|Yogurt, Cokelat|Permen, Es Krim|Es Campur, Bubur|Lontong, Pempek|Siomay, Donat|Bolu,
  Madu|Sirup, Kecap|Saus, Cabai|Merica, Durian|Nangka, Rambutan|Leci, Jeruk|Lemon,
  Anggur|Stroberi, Kelapa|Nanas, Apel|Pir, Bayam|Kangkung, Jagung|Kentang,
  Telur Ceplok|Telur Dadar, Klepon|Onde Onde, Sushi|Dimsum, Jus Alpukat|Jus Mangga,
  Air Kelapa|Air Tebu, Wedang Jahe|Bandrek, Sapi|Kerbau, Burung Hantu|Elang, Kupu Kupu|Capung,
  Nyamuk|Lalat, Penyu|Kura Kura, Buaya|Komodo, Ular|Cacing, Katak|Kadal, Udang|Kepiting,
  Merpati|Kakatua, Kelelawar|Tupai, Rumah Sakit|Puskesmas, Perpustakaan|Toko Buku, Hotel|Vila,
  Kolam Renang|Pemandian, Kamar Tidur|Ruang Tamu, Warung|Restoran, Lapangan|Stadion,
  Kantor Pos|Bank, Taman|Alun Alun, Gurun|Padang Rumput, Goa|Terowongan, Angkot|Ojek,
  Taksi|Limusin, Kapal Selam|Kapal Pesiar, Skuter|Skateboard, Truk|Pikap, Balon Udara|Parasut,
  Selimut|Sarung, Meja|Lemari, Jam Tangan|Gelang, Kacamata|Teropong, Handuk|Keset, Ember|Gayung,
  Kulkas|Kompor, Kipas Angin|Kipas Tangan, Panci|Wajan, Gelas|Cangkir, Buku|Majalah,
  Surat|Kartu Pos, Penghapus|Rautan, Penggaris|Jangka, Spidol|Krayon, Kalender|Jam Dinding,
  Cermin|Jendela, Pintu|Gerbang, Tangga|Lift, Kasur|Tikar, Kemeja|Kaos, Jaket|Sweter,
  Kaus Kaki|Sarung Tangan, Dasi|Syal, Kalung|Anting, Cincin|Bros, Sepak Bola|Futsal,
  Lari|Jalan Cepat, Catur|Ular Tangga, Piano|Pianika, Suling|Terompet, Angklung|Kolintang,
  Memasak|Memanggang, Memancing|Berkemah, Layangan|Balon, Kelereng|Gasing,
  Petak Umpet|Gobak Sodor, Teka Teki|Kuis, Bersepeda|Mendaki, Yoga|Senam, Karate|Silat,
  Selancar|Berlayar, Ski|Seluncur Es, Polisi|Satpam, Pilot|Pramugari, Penyanyi|Penari,
  Tukang Kayu|Tukang Batu, Astronot|Ilmuwan, Pelukis|Fotografer, Penulis|Wartawan,
  Sopir|Kondektur, Montir|Teknisi, Dokter Gigi|Dokter Hewan, Kasir|Pramuniaga, Hujan|Salju,
  Angin|Badai, Laut|Samudra, Pasir|Batu, Mawar|Melati, Anggrek|Teratai,
  Pohon Kelapa|Pohon Pisang, Daun|Ranting, Siang|Malam, Musim Hujan|Musim Kemarau, Kabut|Asap,
  Es Batu|Embun, Api Unggun|Kembang Api, Liburan|Piknik, Konser|Festival, Sirkus|Pasar Malam,
  Hadiah|Kejutan, Foto|Video, Ponsel|Tablet, Peri|Penyihir, Unicorn|Pegasus,
  Harta Karun|Peti Emas, Bakwan|Tahu Isi, Nasi Uduk|Nasi Kuning, Lemper|Arem Arem,
  Kopi Susu|Cokelat Panas, Teh Tarik|Teh Manis, Kolak|Bubur Kacang, Serabi|Kue Cubit,
  Seblak|Cilok, Batagor|Cireng, Sambal|Saus Tomat, Kerak Telor|Martabak Telur,
  Tikus|Marmut, Rusa|Kijang, Cicak|Tokek, Belalang|Jangkrik, Ikan Mas|Ikan Lele,
  Kuas|Spons, Sapu|Pel, Palu|Obeng, Tenda|Pondok, Peta|Globe, Senter|Lentera, Boneka|Wayang,
  Gendang|Rebana, Kostum|Seragam, Kebaya|Batik, Topi Jerami|Topi Koboi, Gerobak|Delman
`;

const EN_EASY = `
  Coffee|Tea, Beach|Lake, Cat|Dog, Bicycle|Motorbike, Pencil|Crayon, Spoon|Fork, Shoes|Sandals,
  Sun|Moon, Airplane|Helicopter, Train|Bus, Pizza|Burger, Guitar|Violin, Lion|Tiger,
  Elephant|Rhino, Horse|Zebra, Chicken|Duck, Shark|Dolphin, Monkey|Gorilla, Rabbit|Hamster,
  Giraffe|Camel, Panda|Koala, Penguin|Swan, Mountain|Hill, School|College, Cinema|Theater,
  Airport|Train Station, River|Waterfall, Kitchen|Bathroom, Village|City, Ship|Boat,
  Rocket|Satellite, Pillow|Blanket, Chair|Sofa, Lamp|Candle, Umbrella|Raincoat, Toothbrush|Comb,
  Soap|Shampoo, Television|Radio, Scissors|Knife, Plate|Bowl, Key|Lock, Backpack|Suitcase,
  Pants|Shorts, Hat|Helmet, Badminton|Tennis, Basketball|Volleyball, Swimming|Diving,
  Singing|Dancing, Doctor|Nurse, Teacher|Professor, Chef|Waiter, Farmer|Fisherman, Star|Comet,
  Morning|Evening, Birthday|Wedding, Computer|Laptop, Dragon|Dinosaur, Pirate|Ninja,
  Watermelon|Melon, Banana|Mango, Salt|Sugar, Tomato|Carrot, Goat|Sheep, Bee|Wasp, Zoo|Aquarium,
  Market|Supermarket, Forest|Jungle, Robot|Doll, Camera|Projector, King|Prince, Rainbow|Cloud,
  Octopus|Squid
`;

const EN_HARD = `
  Bread|Cake, Pancake|Waffle, Cookie|Cracker, Juice|Smoothie, Milk|Yogurt, Chocolate|Candy,
  Ice Cream|Frozen Yogurt, Soup|Stew, Salad|Sandwich, Rice|Noodles, Hot Dog|Taco, Donut|Muffin,
  Honey|Jam, Ketchup|Mustard, Pepper|Chili, Lemon|Lime, Orange|Tangerine, Strawberry|Cherry,
  Grape|Raisin, Coconut|Pineapple, Potato|Sweet Potato, Popcorn|Chips, Cheese|Butter,
  Fried Egg|Omelette, Cereal|Oatmeal, Lemonade|Soda, Cupcake|Brownie, Pie|Tart, Sushi|Dumpling,
  Cow|Buffalo, Owl|Eagle, Butterfly|Dragonfly, Ant|Termite, Mosquito|Fly, Turtle|Tortoise,
  Crocodile|Alligator, Snake|Worm, Frog|Toad, Shrimp|Crab, Pigeon|Parrot, Bat|Squirrel, Wolf|Fox,
  Bear|Raccoon, Deer|Moose, Whale|Seal, Peacock|Flamingo, Spider|Scorpion, Hedgehog|Porcupine,
  Goldfish|Clownfish, Snail|Slug, Hospital|Clinic, Library|Bookstore, Hotel|Hostel,
  Swimming Pool|Water Park, Bedroom|Living Room, Cafe|Restaurant, Park|Playground,
  Desert|Savanna, Cave|Tunnel, Island|Peninsula, Castle|Palace, Farm|Garden, Museum|Gallery,
  Bakery|Candy Shop, Stadium|Gym, Lighthouse|Tower, Bridge|Pier, Car|Truck, Taxi|Limousine,
  Submarine|Cruise Ship, Scooter|Skateboard, Balloon|Kite, Tractor|Bulldozer, Canoe|Kayak,
  Sled|Snowboard, Ambulance|Fire Truck, Table|Desk, Watch|Bracelet, Glasses|Binoculars,
  Towel|Bathrobe, Bucket|Watering Can, Fridge|Oven, Fan|Heater, Pot|Pan, Glass|Mug,
  Wallet|Purse, Book|Magazine, Letter|Postcard, Eraser|Sharpener, Ruler|Compass,
  Marker|Highlighter, Calendar|Clock, Mirror|Window, Door|Gate, Stairs|Elevator,
  Mattress|Hammock, Shirt|Sweater, Skirt|Dress, Jacket|Coat, Socks|Gloves, Tie|Scarf,
  Necklace|Earrings, Ring|Crown, Hammer|Screwdriver, Brush|Sponge, Broom|Mop, Phone|Tablet,
  Teddy Bear|Puppet, Map|Globe, Flashlight|Lantern, Tent|Cabin, Soccer|Rugby, Running|Jogging,
  Chess|Checkers, Piano|Organ, Drums|Tambourine, Flute|Trumpet, Cooking|Baking, Fishing|Camping,
  Marbles|Spinning Top, Hide and Seek|Tag, Puzzle|Riddle, Hiking|Cycling, Yoga|Stretching,
  Karate|Judo, Surfing|Sailing, Skiing|Ice Skating, Bowling|Billiards, Painting|Drawing,
  Reading|Writing, Knitting|Sewing, Juggling|Magic Tricks, Police|Security Guard,
  Pilot|Astronaut, Singer|Dancer, Carpenter|Plumber, Scientist|Inventor, Painter|Photographer,
  Writer|Journalist, Mechanic|Engineer, Dentist|Vet, Cashier|Shopkeeper, Firefighter|Lifeguard,
  Baker|Butcher, Tailor|Designer, Wind|Storm, Sea|Ocean, Sand|Rock, Rose|Tulip, Orchid|Lily,
  Palm Tree|Pine Tree, Leaf|Branch, Day|Night, Summer|Spring, Winter|Autumn, Fog|Smoke,
  Ice Cube|Snowball, Campfire|Fireworks, Volcano|Geyser, Thunder|Lightning, Rain|Snow,
  Holiday|Picnic, Concert|Festival, Circus|Carnival, Gift|Surprise, Photo|Video, Wizard|Fairy,
  Unicorn|Pegasus, Treasure Chest|Piggy Bank, Snowman|Scarecrow, Superhero|Villain,
  Hula Hoop|Jump Rope, Bubble|Foam, Sandcastle|Snow Fort, Whistle|Bell, Rope|Chain,
  Pumpkin|Squash, Notebook|Diary
`;

export const PAIRS: Record<Lang, readonly WordPair[]> = {
  id: [...parse(ID_EASY, true), ...parse(ID_HARD, false)],
  en: [...parse(EN_EASY, true), ...parse(EN_HARD, false)],
};

/** Letters only, uppercase: "Mi Ayam" and "MIAYAM" compare equal. */
export function normalizeWord(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
}

/** Stable id of a pair, for "recently played" memory on this main screen. */
export function pairKey(lang: Lang, p: WordPair): string {
  const [x, y] = [normalizeWord(p.a), normalizeWord(p.b)].sort();
  return `${lang}:${x}/${y}`;
}
