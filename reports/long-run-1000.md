# Long-Run Ecosystem Report (1000 ticks)

Generated at: 2026-06-13T04:52:51.881Z

Source state: `data/world.json`

Important: this report was generated from an in-memory copy of the world. The live `data/world.json` file was not evolved or overwritten by this analysis script.

## Verdict

The world **remained dynamic** over 1000 simulated ticks.

## Summary

| Metric | Initial | Final |
| --- | --- | --- |
| Tick | 8 | 1008 |
| Living species | 4 | 6 |
| Extinct species | 0 | 23 |
| Total population | 196 | 2,536 |
| Biodiversity index | 1.073 | 1.128 |

## Turnover

| Metric | Value |
| --- | --- |
| Total species seen | 29 |
| Living at end | 6 |
| Extinct at end | 23 |
| Immigration events | 12 |
| Speciation events | 13 |
| Extinction events | 23 |

## Population And Biodiversity Range

| Metric | Value |
| --- | --- |
| Minimum total population reached | 196 |
| Maximum total population reached | 2,812 |
| Minimum biodiversity reached | 0.830 |
| Maximum biodiversity reached | 1.946 |

## Trend Samples

| Simulated tick offset | World tick | Living species | Extinct species | Total population | Biodiversity |
| --- | --- | --- | --- | --- | --- |
| 0 | 8 | 4 | 0 | 196 | 1.073 |
| 100 | 108 | 7 | 1 | 679 | 1.453 |
| 200 | 208 | 6 | 3 | 443 | 1.655 |
| 300 | 308 | 6 | 4 | 419 | 1.599 |
| 400 | 408 | 6 | 8 | 380 | 1.642 |
| 500 | 508 | 7 | 10 | 315 | 1.705 |
| 600 | 608 | 6 | 12 | 301 | 1.595 |
| 700 | 708 | 9 | 13 | 634 | 1.784 |
| 800 | 808 | 7 | 17 | 971 | 1.205 |
| 900 | 908 | 8 | 19 | 2,400 | 1.010 |
| 1000 | 1008 | 6 | 23 | 2,536 | 1.128 |

## Final Living Species

| Species | Population | Preferred biome | Origin |
| --- | --- | --- | --- |
| Silverskipper | 19 | desert | speciation at tick 179 |
| Silversinger | 73 | mountain | speciation at tick 278 |
| Lumensinger | 712 | grassland | immigration at tick 679 |
| Bluesinger | 1,344 | forest | speciation at tick 692 |
| Silversinger 2 | 384 | wetland | speciation at tick 763 |
| Rustmote | 4 | mountain | speciation at tick 950 |

## Recently Extinct Species

| Species | Extinction tick | Preferred biome | Origin |
| --- | --- | --- | --- |
| Lumengrazer | 601 | mountain | speciation at tick 484 |
| Lumengrazer 2 | 624 | desert | speciation at tick 502 |
| Mossling | 720 | forest | seed at tick 0 |
| Lumenskipper | 732 | grassland | immigration at tick 12 |
| Reedgrazer | 770 | wetland | seed at tick 0 |
| Frostback | 781 | wetland | immigration at tick 759 |
| Dawnweaver | 871 | forest | immigration at tick 683 |
| Lumenling | 886 | wetland | immigration at tick 869 |
| Dawnsprout | 909 | wetland | speciation at tick 660 |
| Silverweaver | 925 | grassland | immigration at tick 862 |
| Thornling | 955 | grassland | speciation at tick 902 |
| Dawnmote | 1007 | forest | immigration at tick 959 |

## Classification Criteria

- **collapsed:** no living population, or severe unreplenished diversity loss.
- **stagnated:** low population movement and no ecological turnover.
- **exploded:** runaway population growth.
- **dynamic:** none of the above; the run keeps population and turnover activity.

## Notes

- Seed: `439041101`
- Initial RNG state: `{"algorithm":"xorshift32","seed":439041101,"state":1826426339}`
- Final RNG state: `{"algorithm":"xorshift32","seed":439041101,"state":2800733124}`
- Extinct species are listed separately from active living species to keep the report readable.
