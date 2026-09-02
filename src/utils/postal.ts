let postOfficesPromise: Promise<Map<string, string>> | null = null;

export function loadPostOffices(): Promise<Map<string, string>> {
    if (postOfficesPromise) return postOfficesPromise;

    postOfficesPromise = fetch('assets/postitoimipaikat.xml')
        .then((res) => res.text())
        .then((text) => {
            const xml = new DOMParser().parseFromString(text, 'application/xml');
            const offices = new Map<string, string>();
            for (const office of xml.querySelectorAll('toimipaikka')) {
                const code = office.querySelector('postinumero')?.textContent?.trim() ?? '';
                const name = (office.querySelector('nimi')?.textContent ?? '')
                    .split('-')
                    .map((part) => part.trim().replace(/\s+\d+$/, ''))
                    .filter(Boolean)
                    .join(' - ');
                if (code && name && !offices.has(code)) offices.set(code, name);
            }
            return offices;
        });

    return postOfficesPromise;
}