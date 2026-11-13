# Dibuja y Adivina

Juego web multijugador para dibujar y adivinar palabras chilenas en familia o con amigos. Sin
registro, sin publicidad y directo al navegador (computador o celular).

**Jugar ahora:** <https://dibujayadivina-production.up.railway.app>

## ¿Por qué existe?

Este proyecto nació por los buenos recuerdos de jugar _iSketch_ en su momento: esa mezcla de
risas, dibujos torpes y palabras que nadie lograba sacar. Hoy existen millones de alternativas en
sitios web y aplicaciones móviles, pero casi siempre traen algún detalle molesto: publicidad
invasiva, registros innecesarios o trabas para entrar rápido.

La idea acá es simple: que cualquier familia o grupo de amigos pueda compartir este clásico sin
fricciones, echar unas buenas risas y pasarlo bien adivinando palabras bien chilenas. Nada más.

## Características principales

- **Salas privadas al instante**: creas una sala, compartes el código de 4 letras o el enlace
  directo (`/sala/ABCD`) y a jugar (de 2 a 12 jugadores).
- **100 % a la chilena**: banco de unas 300 palabras con comida típica (_completo_, _sopaipilla_,
  _mote con huesillo_, _chorrillana_), chilenismos y vida diaria (_micro_, _guata_, _polera_),
  flora y fauna (_huemul_, _cóndor_, _copihue_), lugares (_Torres del Paine_, _Valparaíso_),
  cultura y fiestas (_cueca_, _fonda_, _volantín_) y objetos cotidianos.
- **En computador y celular**: diseño adaptado a escritorio y pantallas táctiles (vertical y
  apaisado), cuidando que el teclado del teléfono no tape el dibujo ni el chat.
- **Herramientas de dibujo**: pincel con 12 colores y 4 grosores, bote de pintura (relleno), goma
  de borrar, deshacer y limpiar lienzo.
- **Dinámica ágil**: un único campo para adivinar y chatear, aviso privado de _"¡Casi!"_ cuando
  estás a una letra, pistas progresivas, efectos de sonido sintetizados (con opción de silenciar)
  y reconexión automática si se cae la señal.

## Cómo se juega

Por turnos, quien dibuja elige entre 3 palabras y el resto intenta adivinarla escribiendo en el
chat. El primer acierto acorta el reloj a 20 segundos, así que conviene apurarse. Suman más puntos
quienes adivinan primero, y quien dibuja suma por cada acierto del resto.

## Desarrollo local

Requisitos: Node.js >= 22 y `pnpm`.

```sh
pnpm install
pnpm dev # levanta servidor y cliente web en paralelo
pnpm test # pruebas unitarias y de integración con Vitest
pnpm e2e # pruebas de extremo a extremo con Playwright
pnpm typecheck && pnpm lint
```

Documentación interna:

- [Motor de reglas](docs/motor-reglas.md)
- [Despliegue](docs/despliegue.md)

## Aportar un café

Si el juego les sacó unas risas, puedes apoyar el proyecto con un café. Se agradece de corazón.

[![Invitame un café en Buy Me a Coffee](https://img.buymeacoffee.com/button-api/?text=Invitame%20un%20caf%C3%A9&emoji=%E2%98%95&slug=fgbravom&button_colour=FF813F&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff)](https://www.buymeacoffee.com/fgbravom)
