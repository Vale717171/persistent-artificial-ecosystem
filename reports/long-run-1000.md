# Long-Run Ecosystem Report (1000 ticks)

Generated at: 2026-07-25T06:20:50.149Z

Source state: `data/world.json`

Important: this report was generated from an in-memory copy of the world. The live `data/world.json` file was not evolved or overwritten by this analysis script.

## Verdict

The world **remained dynamic** over 1000 simulated ticks.

## Summary

| Metric | Initial | Final |
| --- | --- | --- |
| Tick | 176 | 1176 |
| Living species | 5 | 10 |
| Extinct species | 3 | 36 |
| Total population | 437 | 2,012 |
| Biodiversity index | 1.546 | 1.298 |

## Turnover

| Metric | Value |
| --- | --- |
| Total species seen | 46 |
| Living at end | 10 |
| Extinct at end | 36 |
| Immigration events | 0 |
| Speciation events | 38 |
| Extinction events | 33 |

## Population And Biodiversity Range

| Metric | Value |
| --- | --- |
| Minimum total population reached | 120 |
| Maximum total population reached | 2,030 |
| Minimum biodiversity reached | 0.424 |
| Maximum biodiversity reached | 2.168 |

## Trend Samples

| Simulated tick offset | World tick | Living species | Extinct species | Total population | Biodiversity |
| --- | --- | --- | --- | --- | --- |
| 0 | 176 | 5 | 3 | 437 | 1.546 |
| 100 | 276 | 5 | 3 | 143 | 1.529 |
| 200 | 376 | 5 | 7 | 132 | 0.711 |
| 300 | 476 | 7 | 12 | 447 | 1.297 |
| 400 | 576 | 10 | 13 | 1,237 | 1.541 |
| 500 | 676 | 11 | 18 | 807 | 1.867 |
| 600 | 776 | 11 | 19 | 1,629 | 1.153 |
| 700 | 876 | 7 | 26 | 1,051 | 1.464 |
| 800 | 976 | 10 | 28 | 1,063 | 1.587 |
| 900 | 1076 | 10 | 30 | 1,590 | 1.449 |
| 1000 | 1176 | 10 | 36 | 2,012 | 1.298 |

## Final Living Species

| Species | Population | Preferred biome | Origin |
| --- | --- | --- | --- |
| Dawnmote | 1,254 | mountain | speciation at tick 612 |
| Cinderweaver 2 | 293 | desert | speciation at tick 877 |
| Lumensinger | 170 | desert | speciation at tick 966 |
| Amberskipper | 74 | mountain | speciation at tick 1007 |
| Bluemote | 65 | mountain | speciation at tick 1078 |
| Dawnmote 2 | 6 | mountain | speciation at tick 1103 |
| Blueweaver 2 | 10 | mountain | speciation at tick 1104 |
| Frostgrazer | 74 | desert | speciation at tick 1125 |
| Rustskipper | 64 | mountain | speciation at tick 1160 |
| Amberrunner | 2 | desert | speciation at tick 1175 |

## Recently Extinct Species

| Species | Extinction tick | Preferred biome | Origin |
| --- | --- | --- | --- |
| Cinderweaver | 802 | desert | speciation at tick 458 |
| Blueskipper | 864 | mountain | speciation at tick 812 |
| Silvermote | 958 | mountain | speciation at tick 918 |
| Rustmote | 968 | mountain | speciation at tick 962 |
| Lumenskipper 2 | 1000 | mountain | speciation at tick 956 |
| Thornmote 2 | 1033 | mountain | speciation at tick 613 |
| Cinderrunner | 1101 | desert | speciation at tick 823 |
| Lumenmote | 1102 | desert | speciation at tick 452 |
| Silversprout | 1108 | desert | speciation at tick 999 |
| Ambersinger | 1118 | mountain | speciation at tick 874 |
| Cragback | 1121 | mountain | seed at tick 0 |
| Thornmote | 1121 | desert | speciation at tick 465 |

## Classification Criteria

- **collapsed:** no living population, or severe unreplenished diversity loss.
- **stagnated:** low population movement and no ecological turnover.
- **exploded:** runaway population growth.
- **dynamic:** none of the above; the run keeps population and turnover activity.

## Notes

- Seed: `439041101`
- Initial RNG state: `{"algorithm":"xorshift32","seed":439041101,"state":1847235685}`
- Final RNG state: `{"algorithm":"xorshift32","seed":439041101,"state":2792537148}`
- Extinct species are listed separately from active living species to keep the report readable.
