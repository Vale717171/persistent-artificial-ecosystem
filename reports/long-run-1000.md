# Long-Run Ecosystem Report (1000 ticks)

Generated at: 2026-06-12T17:52:45.340Z

Source state: `data/world.json`

Important: this report was generated from an in-memory copy of the world. The live `data/world.json` file was not evolved or overwritten by this analysis script.

## Verdict

The world **remained dynamic** over 1000 simulated ticks.

## Summary

| Metric | Initial | Final |
| --- | ---: | ---: |
| Tick | 8 | 1008 |
| Living species | 4 | 6 |
| Extinct species | 0 | 21 |
| Total population | 196 | 1,030 |
| Biodiversity index | 1.073 | 1.108 |

## Event Counts

| Event type | Count |
| --- | ---: |
| Immigration | 13 |
| Speciation | 10 |
| Extinction | 21 |

## Population Range

| Metric | Value |
| --- | ---: |
| Minimum total population reached | 196 |
| Maximum total population reached | 1,829 |
| Minimum biodiversity reached | 0.814 |
| Maximum biodiversity reached | 1.704 |

## Trend Samples

| Simulated tick offset | World tick | Living species | Extinct species | Total population | Biodiversity |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 8 | 4 | 0 | 196 | 1.073 |
| 100 | 108 | 7 | 2 | 825 | 1.614 |
| 200 | 208 | 6 | 4 | 874 | 1.635 |
| 300 | 308 | 6 | 6 | 981 | 1.360 |
| 400 | 408 | 6 | 9 | 955 | 1.448 |
| 500 | 508 | 7 | 10 | 1,480 | 0.926 |
| 600 | 608 | 6 | 13 | 1,368 | 0.906 |
| 700 | 708 | 7 | 14 | 611 | 1.422 |
| 800 | 808 | 6 | 17 | 1,034 | 1.285 |
| 900 | 908 | 5 | 18 | 1,043 | 1.313 |
| 1000 | 1008 | 6 | 21 | 1,030 | 1.108 |

## Final Species

| Species | Population | Preferred biome | Origin |
| --- | ---: | --- | --- |
| Mossling | 0 | forest | seed |
| Reedgrazer | 33 | wetland | seed |
| Dustskipper | 131 | desert | seed |
| Cragback | 0 | mountain | seed |
| Lumenskipper | 121 | grassland | immigration at tick 12 |
| Silverling | 0 | desert | immigration at tick 41 |
| Lumenback | 0 | grassland | speciation at tick 70 |
| Bluesprout | 0 | wetland | speciation at tick 72 |
| Silverling | 0 | mountain | speciation at tick 93 |
| Rustsprout | 0 | desert | speciation at tick 141 |
| Ambergrazer | 0 | grassland | speciation at tick 219 |
| Blueweaver | 0 | grassland | immigration at tick 282 |
| Rustsprout | 0 | grassland | immigration at tick 316 |
| Amberweaver | 0 | wetland | immigration at tick 337 |
| Dawnrunner | 676 | forest | immigration at tick 375 |
| Thorngrazer | 60 | mountain | speciation at tick 488 |
| Cinderback | 0 | wetland | speciation at tick 505 |
| Frostling | 0 | forest | immigration at tick 563 |
| Dawnweaver | 0 | forest | immigration at tick 577 |
| Amberling | 0 | forest | immigration at tick 686 |
| Silvermote | 0 | forest | immigration at tick 704 |
| Thornsinger | 0 | forest | speciation at tick 762 |
| Amberweaver | 0 | desert | speciation at tick 803 |
| Silversinger | 0 | desert | speciation at tick 920 |
| Frostweaver | 0 | grassland | immigration at tick 922 |
| Blueling | 0 | desert | immigration at tick 935 |
| Dawnmote | 9 | grassland | immigration at tick 1003 |

## Notes

- Initial RNG state: `{"algorithm":"xorshift32","seed":439041101,"state":1826426339}`
- Final RNG state: `{"algorithm":"xorshift32","seed":439041101,"state":2197910083}`
- Classification rule: collapsed means no living population or severe unreplenished diversity loss; stagnated means low movement and no ecological turnover; exploded means runaway population growth; otherwise the run is considered dynamic.
