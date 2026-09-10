# Friend DeskPet Runtime

## Run

```bash
cd app
npm install
npm start
```

## Assets

Place transparent PNG character sprites:

```
assets/character/
├── idle.png
├── wave.png
└── sleep.png
```

The runtime is intentionally simple:

- transparent always-on-top window
- sprite based animation
- click interaction
- companion behavior only

Future extensions:

- walking movement
- tray menu
- startup launch
- local memory
- optional LLM companion layer
