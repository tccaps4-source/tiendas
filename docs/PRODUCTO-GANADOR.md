# El producto ganador: antifaz 3D "blackout"

Documento de decisión. Explica qué se eligió, contra qué se comparó y bajo qué
supuestos. Si alguno de esos supuestos cambia, la conclusión hay que revisarla.

Investigación hecha el 18 de septiembre de 2026.

---

## La decisión en una línea

**Antifaz contorneado 3D con bloqueo total de luz**, vendido como marca propia
dentro del nicho de *sleepmaxxing*, con un kit (antifaz + tapones + estuche)
como principal palanca de ticket promedio.

En el catálogo: [`noctu-antifaz-blackout-3d`](../catalog/noctu-antifaz-blackout-3d.json).

---

## Cómo se llegó ahí

### 1. Primero el nicho, después el producto

Un producto viral suelto se agota en semanas. Un nicho con viento de cola
sostiene varios productos y permite construir marca, que es lo único que evita
competir por precio.

El nicho elegido es **sueño / descanso**, por tres datos:

- El mercado de salud y bienestar proyecta **USD 6,3 billones en 2026**, creciendo
  al 8% anual, y es la categoría más consistentemente rentable del ecommerce.
- El **sueño es una industria de USD 90.000 millones** en 2026.
- *Sleepmaxxing* — optimizar cada variable del descanso — acumula **más de 125
  millones de posteos** en redes. Es demanda ya existente: no hay que educar al
  mercado sobre por qué el producto importa.

Además, en LatAm el ticket que mejor convierte está entre **USD 15 y 45**, y el
sueño tiene productos naturalmente en ese rango.

### 2. Qué se descartó dentro del nicho, y por qué

| Candidato | Por qué se descartó |
|---|---|
| **Mouth tape** (cinta bucal) | Es el producto con mejores números en abstracto: 340% de crecimiento en búsquedas desde 2022 y costo unitario de centavos. Pero **ningún producto tiene aprobación de la FDA** como tratamiento, la **FTC ya mandó cartas de advertencia** a tres empresas por afirmaciones de salud no sustentadas, hay **eventos adversos documentados** (dermatitis de contacto, ansiedad) y una revisión sistemática de 2025 concluyó que **puede empeorar la apnea del sueño**. Construir una marca sobre eso es construirla sobre un pasivo legal y un riesgo de baneo publicitario. |
| **Sábanas de "grounding"** | Las búsquedas se cuadruplicaron en un año, pero el argumento de venta es pseudocientífico. Mismo problema regulatorio, con menos defensa. |
| **Suplementos (magnesio, melatonina)** | Excelente LTV por ser consumibles, pero requieren registro sanitario (ANMAT, INVIMA, COFEPRIS) e importación regulada. No es un primer producto. |
| **Anillos y trackers de sueño** | Crecen 29,3% anual, pero ticket alto, firmware, garantía y devoluciones. Demasiada superficie operativa para arrancar. |
| **Almohadillas térmicas / colchones** | Voluminosos y frágiles. En LatAm el envío se come el margen y las devoluciones duelen. |
| **Anteojos de luz azul** | Saturado y con eficacia discutida. |

### 3. Por qué el antifaz 3D gana

Es el único candidato que **hereda todo el viento de cola del sleepmaxxing sin
heredar ninguno de sus problemas**.

**Económicamente**

- Costo landed ≈ **USD 3,20**, precio de venta **USD 24,90** → **markup 7,8x**,
  margen bruto **87%**. Muy por encima del 55–65% que se considera saludable.
- ROAS de equilibrio **1,24x**: recuperás la inversión publicitaria vendiendo
  apenas por encima de lo que gastaste. Da muchísimo aire para aprender a
  comprar tráfico sin fundirte.
- El segmento contorneado es el de **mayor CAGR proyectado** dentro del mercado
  de antifaces (2025–2030), traccionado justamente por las cavidades moldeadas.
- El rango de precios del mercado va de USD 8 a USD 80, con **MZOO en USD 19,99**
  como referencia del escalón 3D básico. USD 24,90 posiciona arriba de la
  góndola genérica sin entrar en lujo.

**Operativamente**

- **85 gramos y plano.** Entra en sobre acolchado, no en caja. El envío no se
  come el margen.
- **Talle único.** No hay curva de talles ni el 30% de devoluciones de la ropa.
- **No es frágil.** No se rompe en tránsito.
- **Sin registro sanitario.** Es un accesorio textil, no un dispositivo médico ni
  un cosmético. Se importa y se vende sin trámite regulatorio.

**Comercialmente**

- El beneficio es **físico y demostrable**: "no entra luz". No hace falta hacer
  ninguna afirmación de salud. Eso lo mantiene fuera del radar de moderación
  publicitaria de Meta y TikTok, que es donde mueren la mayoría de los productos
  de "bienestar".
- **Es visual.** El contraste antifaz plano vs. 3D se muestra en cinco segundos
  de video. Es material publicitario que se hace solo.
- **Es regalable.** Día de la Madre, Día del Padre y Navidad le dan tres picos
  estacionales sin esfuerzo.
- **Tiene público con dolor concreto:** turno noche, guardias, padres primerizos,
  gente que comparte cuarto, viajeros frecuentes. Son segmentos de audiencia
  bien definidos para segmentar publicidad.

**La debilidad honesta**

No es consumible: nadie compra dos antifaces por año. Eso limita la recompra y,
con ella, el LTV.

Se compensa de dos maneras, ambas ya en el catálogo:

1. **El kit** ([`noctu-kit-apagon`](../catalog/noctu-kit-apagon.json)) sube el
   ticket de USD 24,90 a **USD 39,90** — un **60% más de facturación** sobre el
   mismo costo de adquisición.
2. **Los tapones** ([`noctu-tapones-silicona`](../catalog/noctu-tapones-silicona.json))
   son el segundo producto lógico y el camino natural hacia una recompra.

---

## Los números, producto por producto

Mercado US, sin CAC ni envío absorbido, comisión de pasarela 6,4%,
devoluciones 3%.

| SKU | Precio | Costo | Markup | Margen bruto | ROAS equilibrio |
|---|---|---|---|---|---|
| Antifaz Blackout 3D | USD 24,90 | USD 3,20 | 7,8x | 87,1% | 1,24x |
| Kit Apagón | USD 39,90 | USD 5,90 | 6,8x | 85,2% | 1,28x |
| Tapones Silence | USD 14,90 | USD 1,60 | 9,3x | 89,3% | 1,21x |

Recalculá para tu mercado y tus costos reales:

```bash
node src/cli.ts pricing --market AR --cac 6000 --shipping 3500
```

---

## Supuestos que hay que verificar antes de comprar stock

Estos son los puntos donde el análisis puede estar equivocado. Vale la pena
chequearlos antes de poner plata.

1. **El costo de USD 3,20 es una estimación** para pedidos de 100–300 unidades
   con el proveedor puesto en tu depósito. Pedí cotización real con flete e
   impuestos incluidos antes de fijar el precio.
2. **Los precios por mercado del catálogo están anclados a USD 24,90** con un
   tipo de cambio aproximado a septiembre de 2026. **Revisalos**, sobre todo en
   Argentina. `node src/cli.ts pricing --market AR` te muestra el markup
   resultante: si bajó de 3x, el tipo de cambio se movió y hay que reajustar.
3. **El mercado global de antifaces es chico** (USD 17,2 millones en 2026). No es
   un problema para un negocio de nicho, pero sí significa que no hay espacio
   para un jugador masivo: el techo está en marca y margen, no en volumen.
4. **Pedí muestra física antes de comprar volumen.** La diferencia entre un
   antifaz 3D bueno y uno malo está en el bloque nasal y en la costura de las
   cavidades. Es exactamente lo que el cliente evalúa la primera noche y lo que
   determina si te devuelven el producto.
5. **La descripción afirma cosas verificables** (0% de luz, 85 g, 2,3 cm de
   espacio, 52–66 cm de correa, 26 dB en los tapones). **Confirmá cada número
   contra el producto real** y corregí el catálogo si no coinciden. La ventaja
   regulatoria de este producto es justamente que no necesita prometer nada que
   no se pueda medir; no la tires por la borda con una ficha inexacta.

---

## Fuentes

- [Health and Wellness Ecommerce en 2026 — Privy](https://www.privy.com/blog/health-wellness-ecommerce)
- [Sleepmaxxing — Wikipedia](https://en.wikipedia.org/wiki/Sleepmaxxing)
- [Sleep Initiative Trends for 2026 — Global Wellness Institute](https://globalwellnessinstitute.org/global-wellness-institute-blog/2026/03/30/sleep-initiative-trends-for-2026/)
- [Sleep Mask Market Size, Share & Trends 2025-2030 — Grand View Research](https://www.grandviewresearch.com/industry-analysis/sleep-mask-market)
- [Sleep Masks Market Analysis & Opportunity 2026-2033 — Persistence Market Research](https://www.persistencemarketresearch.com/market-research/sleep-masks-market.asp)
- [5 Best Contoured Sleep Masks 2026 — Nidra Goods](https://nidragoods.com/blogs/sleep-guides/best-contoured-sleep-mask)
- [Breaking social media fads: safety and efficacy of mouth taping — revisión sistemática, PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12094774/)
- [Mouth Taping for Sleep: benefits, risks, who should avoid — Superpower](https://superpower.com/guides/mouth-tape-benefits-risks-who-should-avoid)
- [Can Mouth Taping During Sleep Be Dangerous? — Houston Methodist](https://www.houstonmethodist.org/blog/articles/2025/oct/can-mouth-tape-during-sleep-be-dangerous/)
- [Los nichos de dropshipping más rentables en LatAm para 2026 — Wiio](https://wiio.com/es/the-most-profitable-dropshipping-niches-in-latam-for-2026/)
- [Winning Products: The Definitive List — Sell The Trend](https://www.sellthetrend.com/blog/winning-products)
