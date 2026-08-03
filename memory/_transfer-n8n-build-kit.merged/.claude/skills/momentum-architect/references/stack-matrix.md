# Matriz de Stack por Tipo de Negocio

Fuente: `knowledge/04_PATRONES_TECNICOS_N8N.md` seccion 4.1

## E-Commerce / Productos
```yaml
Canal: WhatsApp (Evolution) o Instagram (ManyChat)
CRM: Google Sheets o Airtable
Modelo: GPT-4o-mini (conversaciones simples)
Agentes: 3 (Principal, Inventario, Checkout)
```

## Servicios B2B / SaaS
```yaml
Canal: WhatsApp + Web Chat
CRM: Airtable o HubSpot
Modelo: GPT-4o (conversaciones complejas)
Agentes: 4 (Principal/SPIN, Demo, Pricing, Tecnico)
```

## Servicios Locales (Clinicas, Salones)
```yaml
Canal: WhatsApp (Evolution) o Instagram (ManyChat)
CRM: Google Sheets
Modelo: GPT-4o-mini
Agentes: 3 (Principal, Citas, Precios)
```

## Real Estate / Rentals
```yaml
Canal: WhatsApp + Instagram
CRM: Airtable
Modelo: GPT-4o (tickets altos)
Agentes: 3-4 (Principal, Disponibilidad, Precios, Tours)
```

## Microfinanzas / Formularios
```yaml
Canal: WhatsApp
CRM: Sistema propio del cliente
Modelo: GPT-4o-mini (flujo ultra-simple)
Agentes: 1 (enviar formulario inmediatamente)
```

## Asesoria / Consulting
```yaml
Canal: WhatsApp (YCloud para proactivo)
CRM: Notion, Airtable
Modelo: GPT-4o
Agentes: 2 (Calificacion + Agendamiento)
```

## Herramientas Externas

| Herramienta | Funcion | Cuando usar |
|-------------|---------|-------------|
| Evolution API | WhatsApp self-hosted | Default para WA |
| YCloud | WhatsApp oficial | Cuando necesita broadcasts/templates Meta |
| ManyChat | Instagram/FB DM | Siempre para IG |
| Chatwoot | Inbox compartido | Cuando hay equipo humano |
| Airtable | CRM visual | Medio |
| Google Sheets | CRM simple | Simple, <100 leads/mes |
| Supabase/PostgreSQL | DB compleja | Alto volumen, analytics |
| Redis | Cache | Respuestas frecuentes, alta concurrencia |
| Calendly | Citas | Link hardcoded, no API |
| Discord | Notificaciones | String detection en output |
