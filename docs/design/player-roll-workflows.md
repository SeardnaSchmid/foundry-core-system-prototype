# Player click workflows

This document shows where a player starts each workflow and which UI elements
they click. The workflows are independent; Foundry does not automatically pass
an attack from one participant to the next.

## Entry points

| Workflow | Entry point |
|---|---|
| Skill roll | Character sheet → Skills component → skill |
| Attack | Character sheet → Inventory → weapon |
| Dodge | Character sheet → Paper doll → compact **Dodge** button below the silhouette |
| Parry | Character sheet → Inventory → melee weapon |
| Resistance | Character sheet → Paper doll → affected body zone |

## Roll a skill

```mermaid
flowchart LR
    A[Open character sheet]
    B[Open Skills component]
    C[Click skill]
    D[Configure roll dialog]
    E[Click Roll]

    A --> B --> C --> D --> E
```

## Attack an opponent

```mermaid
flowchart LR
    A[Open character sheet]
    B[Open Inventory]
    C[Click weapon]
    D[Weapon popover opens]
    E[Click Attack roll]
    F[Choose reach comparison or range band]
    G[Configure roll dialog]
    H[Click Roll]

    A --> B --> C --> D --> E --> F --> G --> H
```

## Defend against an opponent

An incoming attack can lead to three separate click workflows.

```mermaid
flowchart TD
    A[Incoming attack]

    A --> B[Click Dodge button below silhouette]
    B --> C[Configure roll dialog]
    C --> D[Click Roll]

    A --> E[Click melee weapon in Inventory]
    E --> F[Weapon popover opens]
    F --> G[Click Parry]
    G --> H[Choose reach comparison]
    H --> I[Configure roll dialog]
    I --> J[Click Roll]

    A --> K[Click affected zone on paper doll]
    K --> L[Resistance dialog opens]
    L --> M[Choose penetration result and enter damage value]
    M --> N[Click Roll]
```

The paper-doll card contains two distinct entry points. Its compact icon/value
button directly below the silhouette starts **Dodge**. Clicking a body zone on
the silhouette or the resistance icon in that zone's armour row starts
**Resistance** for that specific location. Parry remains on the relevant melee
weapon.
