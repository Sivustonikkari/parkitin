import { installLocalApi } from './api/local-api';

installLocalApi();

const lotSelect = document.querySelector<HTMLSelectElement>('#camera-lot');
if (lotSelect) {
    void fetch('../api?resource=camera_lots')
        .then((response) => response.json() as Promise<Array<{ id: number; name: string; address: string; city: string }>>)
        .then((lots) => {
            lotSelect.replaceChildren(new Option('Valitse pysäköintialue', ''));
            lots.forEach((lot) => lotSelect.add(new Option(`${lot.id} - ${lot.name}, ${lot.address}, ${lot.city}`, String(lot.id))));
        });
}