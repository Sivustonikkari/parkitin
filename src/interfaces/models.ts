// Shared TypeScript interfaces for Parkitin frontend data and screen state.

export interface LocaleInfo {
    locale: string;
    name: string;
    default: boolean;
}

export type Translations = Record<string, Record<string, string>>;

export interface ProfileData {
    email: string;
    reg_number: string | null;
    first_name: string | null;
    last_name: string | null;
    postal_code: string | null;
    city: string | null;
}

export type AppScreen =
    | { name: 'login' }
    | { name: 'register'; email: string }
    | { name: 'details' }
    | { name: 'message'; key: string }
    | { name: 'welcome'; email: string }
    | { name: 'map' }
    | { name: 'admin' };

export type NavView = 'map' | 'profile' | 'admin';

export interface ParkingLot {
    id: number;
    name: string;
    address: string;
    city: string;
    postal_code: string;
    latitude: string | null;
    longitude: string | null;
    info: string | null;
    capacity: number;
    price_first_3h: string;
    price_per_extra_hour: string;
}

export interface MapLot {
    id: number;
    name: string;
    address: string;
    city: string;
    postal_code: string;
    latitude: string | null;
    longitude: string | null;
    info: string | null;
    capacity: number;
    reserved_slots: number;
    available_slots: number;
    price_first_3h: string;
    price_per_extra_hour: string;
}

export interface ParkingSlot {
    id?: number;
    name: string | null;
    is_active: number | boolean;
}

export interface AdminUser {
    id: number;
    reg_number: string | null;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    postal_code: string | null;
    city: string | null;
    role: string;
    status: string;
}

export interface Payment {
    id: number;
    lot_name: string;
    start_time: string;
    end_time: string;
    price_charged: string;
}
