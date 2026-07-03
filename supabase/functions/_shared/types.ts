export interface DrawResult {
    id?: string;
    drawDay?: string;
    date?: string;
    gagnants: number[];
    extra?: number;
    machine?: string;
    [key: string]: unknown;
}
