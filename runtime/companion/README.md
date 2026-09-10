# Friend Desk Pet Runtime

A minimal companion desktop pet framework.

Goals:
- keep human character assets independent
- support transparent sprite animation
- provide calm companion behavior
- avoid prank/interaction logic

## Asset contract

Place generated human-style sprites under:

```
assets/character/<name>/
├── idle.png
├── walk_left.png
├── walk_right.png
├── wave.png
└── sleep.png
```

The runtime only consumes actions and does not generate images.
