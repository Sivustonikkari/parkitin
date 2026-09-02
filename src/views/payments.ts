import { API_BASE } from '../api/client';
import { trans } from '../i18n/i18n';
import type { Payment } from '../interfaces/models';

export async function renderPayments(container: HTMLElement, token: string): Promise<void> {
    const section = document.createElement('section');
    section.className = 'payments';
    const heading = document.createElement('h2'); heading.textContent = trans('payments.title');
    const tabs = document.createElement('div'); tabs.className = 'payment-tabs';
    const openTab = document.createElement('button'); openTab.type = 'button'; openTab.textContent = trans('payments.open');
    const historyTab = document.createElement('button'); historyTab.type = 'button'; historyTab.textContent = trans('payments.history');
    const content = document.createElement('div');
    tabs.append(openTab, historyTab); section.append(heading, tabs, content); container.appendChild(section);
    const show = async (status: 'open' | 'paid'): Promise<void> => {
        const res = await fetch(`${API_BASE}?resource=payments&status=${status}`, { headers: { Authorization: `Bearer ${token}` } });
        const payments: Payment[] = await res.json();
        content.innerHTML = '';
        if (!payments.length) {
            const empty = document.createElement('p'); empty.className = 'payments-empty';
            empty.textContent = trans(status === 'open' ? 'payments.noOpen' : 'payments.noHistory'); content.appendChild(empty); return;
        }
        const table = document.createElement('table');
        table.innerHTML = `<thead><tr><th>${trans('payments.lot')}</th><th>${trans('payments.time')}</th><th>${trans('payments.cost')}</th></tr></thead>`;
        const body = document.createElement('tbody');
        for (const payment of payments) {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${payment.lot_name}</td><td>${payment.end_time}</td><td>${Number(payment.price_charged).toFixed(2)} EUR</td>`; body.appendChild(row);
        }
        table.appendChild(body); content.appendChild(table);
        const total = payments.reduce((sum, payment) => sum + Number(payment.price_charged), 0);
        const totalText = document.createElement('p'); totalText.className = 'payments-total';
        totalText.textContent = trans(status === 'open' ? 'payments.totalDue' : 'payments.totalPaid', { total: total.toFixed(2) }); content.appendChild(totalText);
        if (status !== 'open') return;
        const payButton = document.createElement('button'); payButton.className = 'submit-button'; payButton.type = 'button'; payButton.textContent = trans('payments.mockMethod');
        payButton.addEventListener('click', () => {
            const overlay = document.createElement('div'); overlay.className = 'payment-popup-overlay';
            const popup = document.createElement('div'); popup.className = 'payment-popup';
            const title = document.createElement('h3'); title.textContent = trans('payments.mockMethod');
            const priceText = document.createElement('p'); priceText.className = 'payment-popup-total'; priceText.textContent = trans('payments.totalDue', { total: total.toFixed(2) });
            const slider = document.createElement('input'); slider.type = 'range'; slider.className = 'payment-slider'; slider.min = '0'; slider.max = '100'; slider.value = '0';
            popup.append(title, priceText, slider); overlay.appendChild(popup); content.appendChild(overlay);
            slider.addEventListener('input', async () => {
                if (Number(slider.value) < 100) return;
                const paid = await fetch(`${API_BASE}?resource=payments_pay`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); overlay.remove();
                if (!paid.ok) return;
                const toast = document.createElement('div'); toast.className = 'payment-success-toast';
                const toastText = document.createElement('div'); toastText.className = 'payment-success-message'; toastText.textContent = trans('payments.success'); toast.appendChild(toastText); document.body.appendChild(toast);
                window.setTimeout(() => toast.classList.add('fade-out'), 2700);
                window.setTimeout(() => { toast.remove(); void show('open'); }, 3000);
            });
            overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
        });
        content.appendChild(payButton);
    };
    openTab.addEventListener('click', () => void show('open')); historyTab.addEventListener('click', () => void show('paid'));
    await show('open');
}