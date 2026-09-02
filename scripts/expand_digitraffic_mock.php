<?php
// Expands the Digitraffic mock dataset to Finnish cities.

$mockFile = __DIR__ . '/digitraffic-mock.json';
$data = json_decode(file_get_contents($mockFile), true, 512, JSON_THROW_ON_ERROR);
$data['features'] = array_values(array_filter($data['features'], function (array $feature): bool {
    return !str_starts_with((string)($feature['properties']['id'] ?? ''), 'mock-');
}));

$cities = [
    ['Helsinki', '00100', 60.1699, 24.9384],
    ['Espoo', '02100', 60.2055, 24.6559],
    ['Vantaa', '01300', 60.2934, 25.2097],
    ['Tampere', '33100', 61.4978, 23.7610],
    ['Turku', '20100', 60.4518, 22.2666],
    ['Jyväskylä', '40100', 62.2426, 25.7473],
    ['Oulu', '90100', 65.0121, 25.4651],
    ['Lahti', '15110', 60.9827, 25.6612],
    ['Kuopio', '70100', 62.8925, 27.6782],
    ['Pori', '28100', 61.4851, 21.7972],
    ['Kouvola', '45100', 60.8681, 26.7042],
    ['Joensuu', '80100', 62.6010, 29.7636],
    ['Vaasa', '65100', 63.0951, 21.6158],
    ['Rovaniemi', '96100', 66.5025, 25.7294],
    ['Seinäjoki', '60100', 62.7935, 22.8419],
    ['Lappeenranta', '53100', 61.0587, 28.1887],
    ['Hämeenlinna', '13100', 60.9930, 24.4649],
    ['Porvoo', '06100', 60.3927, 25.6651],
    ['Kokkola', '67100', 63.8385, 23.1307],
    ['Kotka', '48100', 60.4664, 26.9458],
    ['Salo', '24100', 60.3847, 23.1250],
    ['Mikkeli', '50100', 61.6885, 27.2723],
    ['Kajaani', '87100', 64.2273, 27.7278],
    ['Savonlinna', '57100', 61.8699, 28.8793],
    ['Kemi', '94100', 65.7364, 24.5637],
    ['Rauma', '26100', 61.1272, 21.5113],
];

$names = [
    'P-Avaruuskapseli', 'P-Kumisaapas', 'P-Kanelipulla', 'P-Saunavuoro',
    'P-Muumimuki', 'P-Perunamuusi', 'P-Sukka Hukassa', 'P-Hyppivä Herne',
    'P-Kahvitauko', 'P-Pyörivä Poro', 'P-Naurava Noki', 'P-Vohvelivaunu',
    'P-Pikku Pulla', 'P-Kuunsilta', 'P-Hassu Hattu', 'P-Salmiakki',
    'P-Pannukakku', 'P-Paavo Parkki', 'P-Talviturkki', 'P-Villapaita',
    'P-Torikahvi', 'P-Nokipannu', 'P-Jäätelöauto', 'P-Pulkkamäki',
    'P-Sienikori', 'P-Tähtisumu', 'P-Koirapuisto', 'P-Voileipä',
    'P-Karpalomehu', 'P-Kiiltomato', 'P-Joutsenlaulu', 'P-Mustikkapiirakka',
    'P-Puukenkä', 'P-Kissankello', 'P-Hattara', 'P-Sateenvarjo',
    'P-Kupla', 'P-Korvapuusti', 'P-Possujuna', 'P-Pakkaspilvi',
    'P-Lumipallo', 'P-Retkieväs', 'P-Kalastaja', 'P-Aamukaste',
    'P-Polkagris', 'P-Sumutorvi', 'P-Metsämansikka', 'P-Hyvä Tuuli',
    'P-Peukalopotti', 'P-Riemurasia', 'P-Tuuliviiri', 'P-Seppele',
    'P-Hymyilevä Silta', 'P-Tutiseva Tatti', 'P-Keinuhevonen', 'P-Herkkukori',
    'P-Kultainen Kettu', 'P-Vihreä Vihko', 'P-Paistinpannu', 'P-Lentosukka',
    'P-Suolakurkkutori', 'P-Hömppä', 'P-Kaakao', 'P-Talitiainen',
    'P-Kurkipotku', 'P-Piparkakku', 'P-Pörröpallo', 'P-Koukkunokka',
    'P-Majakkamuffini', 'P-Koirankynsi', 'P-Hyrrä', 'P-Humppa',
    'P-Metsäretki', 'P-Suopursu', 'P-Hymykuoppa', 'P-Kaarnalaiva',
    'P-Paistopiste', 'P-Perhonen', 'P-Pitsaparkki', 'P-Koivuklapi'
];

foreach (array_slice($names, 0, 78) as $index => $name) {
    [$city, $postalCode, $lat, $lon] = $cities[$index % count($cities)];
    $offset = (($index % 5) - 2) * 0.004;
    $data['features'][] = [
        'type' => 'Feature',
        'geometry' => ['type' => 'Point', 'coordinates' => [$lon + $offset, $lat + $offset]],
        'properties' => [
            'id' => 'mock-' . ($index + 1),
            'name' => $name . ' ' . $city,
            'streetAddress' => 'Parkkikatu ' . ($index + 1),
            'postalCode' => $postalCode,
            'operatorName' => 'Parkitin Mock Oy',
            'maxCapacity' => 40 + (($index * 37) % 260),
            'pricingMethod' => 'DISC',
            'usagePurpose' => 'PARK_AND_RIDE',
        ],
    ];
}

file_put_contents(
    $mockFile,
    json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL
);

echo 'Mock features: ' . count($data['features']) . PHP_EOL;
