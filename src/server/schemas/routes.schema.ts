import { z } from "zod";

export const routeItemSchema = z.object({
  order: z.number().int().min(1).max(11),
  id: z.string().min(1),
  path: z.string().startsWith("/"),
  href: z.string().startsWith("/"),
  label: z.string().min(1),
  name: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  badge: z.literal("Em breve").optional(),
  isPlaceholder: z.boolean().optional(),
});

export const routesListSchema = z.array(routeItemSchema).length(11);

export type RouteItemContract = z.infer<typeof routeItemSchema>;
