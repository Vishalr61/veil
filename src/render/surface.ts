/* The single on-screen canvas + its 2D context, shared by every render module. */
export const canvas = document.getElementById('game') as HTMLCanvasElement;
export const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
