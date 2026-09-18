# Plan de lanzamiento

Qué hacer, en qué orden, desde que existe este repositorio hasta la primera
venta. El objetivo de las primeras semanas no es facturar: es **validar con
plata real** si el producto convierte antes de comprometer capital en stock.

---

## Fase 0 — Decidir plataforma

Sólo hace falta una. Las dos están implementadas, así que la decisión es de
negocio, no técnica.

**Tiendanube** si vendés en Argentina, México, Colombia, Chile o Brasil.
Mercado Pago viene integrado, los medios de pago locales y las cuotas funcionan
sin configurar nada, la integración con Andreani / Correo Argentino / OCA es
nativa y el plan inicial es más barato. Es la opción por defecto para LatAm.

**Shopify** si vendés a Estados Unidos o Europa, o si desde el arranque sabés
que vas a necesitar el ecosistema de apps (suscripciones, upsells avanzados,
multi-país). Más potente, más caro, y en LatAm los medios de pago locales
requieren más trabajo.

> Si dudás, arrancá en Tiendanube. El catálogo de este repositorio es el mismo
> para las dos, así que migrar después es correr `publish` apuntando a la otra.

---

## Fase 1 — Validar el producto antes de comprar stock

**No compres 300 unidades todavía.** Este es el paso que se saltea todo el mundo
y es el que separa perder USD 200 de perder USD 3.000.

1. **Pedí 3 a 5 muestras** de dos o tres proveedores distintos. Cuestan USD 30
   en total y llegan en dos semanas.
2. **Dormí con cada una.** Lo que decide la devolución es el bloque nasal y la
   costura de las cavidades. Se nota la primera noche.
3. **Confirmá cada número de la ficha** contra la muestra que elegiste: gramos,
   centímetros de la cavidad, rango de la correa, dB de los tapones. Si no
   coinciden, corregí el JSON del catálogo. La ventaja de este producto es que
   no necesita prometer nada que no se pueda medir.
4. **Pedí cotización real** por 100, 300 y 500 unidades, con flete e impuestos
   puestos en tu depósito. Con ese número corré:

   ```bash
   node src/cli.ts pricing --market AR
   ```

   Si el markup quedó abajo de 3x, o subís el precio o cambiás de proveedor.
   No arranques con menos.

---

## Fase 2 — Fotos

Es el trabajo con mayor retorno de todo el lanzamiento, y el único que no se
puede automatizar. Las imágenes del catálogo son placeholders a propósito.

Con una muestra en la mano y un celular alcanza:

| # | Foto | Para qué |
|---|---|---|
| 1 | Producto solo, fondo neutro | Miniatura del catálogo y de los anuncios |
| 2 | **Comparación antifaz plano vs. 3D** | La foto que vende. Es todo el argumento en una imagen |
| 3 | Persona durmiendo de costado con el antifaz puesto | Prueba de que no molesta |
| 4 | Detalle del interior: cavidades y bloque nasal | Justifica el precio sobre un antifaz de USD 8 |
| 5 | Todo lo que viene en la caja | Reduce la duda previa a la compra |

Una vez subidas a algún hosting público (el CDN de tu propia tienda sirve),
reemplazá `images[].src` en los JSON de `catalog/` y volvé a publicar.

**Video:** grabá 15 segundos poniéndote el antifaz y parpadeando abajo. Es el
creativo que mejor funciona en TikTok y Reels para este producto, y se hace en
una toma.

---

## Fase 3 — Montar la tienda

```bash
cp .env.example .env     # completá las credenciales
node src/cli.ts ping     # confirmá que conectó
node src/cli.ts publish --market AR
```

Los tres productos quedan cargados. Lo que falta configurar a mano en el panel:

- **Medios de pago.** Mercado Pago en LatAm. Activá cuotas sin interés si tu
  margen las banca: en Argentina mueven la conversión más que cualquier otra
  palanca.
- **Envíos.** Los pesos ya están en el catálogo (85 g el antifaz, 215 g el kit),
  así que la cotización automática funciona apenas conectes el transportista.
- **Envío gratis a partir del kit.** Es lo que empuja del antifaz al kit. Poné
  el umbral justo abajo del precio del kit.
- **Página "Cómo elegir tu antifaz"** comparando plano vs. 3D. Capta búsquedas
  informativas y es la página a la que mandar el tráfico frío.

---

## Fase 4 — Primeras ventas

**Primero orgánico.** Subí el video a TikTok y a Reels. Tres o cuatro versiones
del mismo ángulo. Cuesta cero y te dice si el producto engancha antes de gastar
en publicidad.

**Después pago, con presupuesto chico.** USD 10–15 por día durante una semana.
El objetivo no es vender: es descubrir qué creativo y qué audiencia funcionan.

Audiencias por dolor concreto, no por interés genérico:

- Turno noche: enfermería, seguridad, gastronomía, call centers
- Padres y madres primerizos
- Viajeros frecuentes
- Gente que comparte habitación (estudiantes, roommates)

**Cuándo escalar.** Mirá tu ROAS de equilibrio:

```bash
node src/cli.ts pricing --market AR --cac <lo que gastaste / ventas>
```

Si el ROAS real supera al de equilibrio de forma sostenida durante una semana,
escalá el presupuesto 20% cada dos o tres días. Si no lo supera, el problema
está en el creativo o en la ficha de producto, **no** en el presupuesto. Subir
la inversión sobre un embudo que no convierte sólo acelera la pérdida.

---

## Fase 5 — Subir el ticket promedio

El margen ya es alto; lo que mueve la aguja ahora es cuánto gasta cada cliente.
El orden importa: cada paso cuesta más trabajo que el anterior.

1. **Upsell al kit en la ficha del antifaz.** "Sumá tapones y estuche por USD 15
   más." Es gratis y es lo que más convierte.
2. **Bump en el checkout:** un segundo par de tapones a mitad de precio.
3. **Email a los 30 días** de la compra del antifaz ofreciendo los tapones. La
   gente que arregló el problema de la luz ya sabe que el que le queda es el
   ruido.
4. **Packs de regalo en temporada.** Día de la Madre, Día del Padre, Navidad.
   Mismo producto, misma caja, precio distinto.

---

## Fase 6 — Qué producto sigue

La marca es "dormir mejor", no "antifaces". El siguiente producto tiene que
cumplir los mismos filtros que hicieron ganar a este: liviano, sin registro
sanitario, sin afirmaciones de salud y con beneficio demostrable.

En orden de prioridad:

1. **Funda de almohada de seda.** Ticket más alto, misma audiencia, cero
   regulación.
2. **Cortina blackout portátil con ventosas.** Para hoteles y viajes. Resuelve
   el mismo problema que el antifaz en otro contexto.
3. **Antifaz con parlantes bluetooth planos.** Ticket alto, pero ya entrás en
   electrónica: garantía y devoluciones. Dejalo para cuando la operación esté
   aceitada.

Cuando decidas, agregalo como un JSON más en `catalog/` y publicalo con el mismo
comando.
