import type { AppScreen } from '../interfaces/models';

let currentScreen: AppScreen | null = null;

export function getCurrentScreen(): AppScreen | null {
    return currentScreen;
}

export function setCurrentScreen(screen: AppScreen): void {
    currentScreen = screen;
}