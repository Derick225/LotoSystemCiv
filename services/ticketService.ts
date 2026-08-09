import { set, get } from "idb-keyval";

export interface Ticket {
  id: string;
  numbers: number[];
  drawName: string;
  strategy?: string;
  createdAt: number;
}

export const saveTicket = async (ticketData: Omit<Ticket, "id" | "createdAt">) => {
  const newTicket: Ticket = {
    ...ticketData,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };

  const existing = (await get<Ticket[]>("nexus_tickets")) || [];
  await set("nexus_tickets", [newTicket, ...existing]);
};

export const getTickets = async () => {
  return (await get<Ticket[]>("nexus_tickets")) || [];
};
