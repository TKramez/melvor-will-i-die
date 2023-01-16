import { WidMonsterUtil } from "./widmonsterutil.mjs";

export class WIDMonster {
    monsterId = null;
    safetyFactor = 1;
    afflictionFactor = 20;
    monsterArea = null;

    gameClone = null;

    dummyEnemy = null;
    dummyPlayer = null;
    dummyMonster = null;

    name = null;
    attackStyle = null;

    canStun = false;
    canSleep = false;
    stunDamageMultiplier = 1;
    sleepDamageMultiplier = 1;
    conditionDamageMultiplier = 1;

    damageTakenPerAttackEffect = 0;
    damageTakenPerAttack = 0;
    effectiveDamageTakenPerAttack = 0;
    monsterPassiveDecreasedPlayerDamageReduction = 0;

    combatTriangleMultiplier = 1;

    specialAttacks = [];
    specialAttackChanceTotal = 0;

    normalAttackMaxHit = 0;
    effectiveNormalAttackMaxHit = 0;

    specialAttackMaxHit = 0;
    effectiveSpecialAttackMaxHit = 0;
    maxHittingSpecialAttack = null;
    effectiveMaxHittingSpecialAttack = null;

    maxHit = 0;
    effectiveMaxHit = 0;

    increasedMaxHitPercentModifier = 0;
    increasedMaxHitFlatModifier = 0; 
    decreasedMaxHitpointsModifier = 0;
    decreasedDamageReductionModifier = 0;

    // Internal player values
    _playerAttackStyle = null;
    _playerDamageReduction = 0;

    media = "";

    constructor(monsterId, monsterArea, safetyFactor = 1, afflictionFactor = 0) {
        this.monsterId = monsterId;
        this.safetyFactor = safetyFactor;
        this.afflictionFactor = afflictionFactor;
        this.monsterArea = monsterArea;

        this.gameClone = $.extend(true, {}, game);

        this.dummyEnemy = new Enemy(this.gameClone.combat, this.gameClone);
        this.dummyPlayer = $.extend(true, {}, this.gameClone).combat.player;

        this._playerAttackStyle = this.dummyPlayer.attackType;
    
        /*
            Set monster for the Enemy object via id lookup from game.monsters
            Example id: "melvorF:Umbora"
            Game data stuff can be found:
            https://melvoridle.com/assets/schema/gameData.json
            https://melvoridle.com/assets/data/melvorFull.json
            https://melvoridle.com/assets/data/melvorTotH.json
        */
        this.dummyMonster = this.gameClone.monsters.find(m => m.id === this.monsterId);
        this.media = this.dummyMonster.media;

        this.dummyEnemy.setMonster(this.dummyMonster);
        this.dummyEnemy.target = this.dummyPlayer;
        this.dummyEnemy.computeMaxHit();

        this._playerDamageReduction = this._computeStandardDamageReduction();

        this.specialAttackChanceTotal = 0;
        this.name = this.dummyMonster._name;
        this.attackStyle = this.dummyMonster.attackType;

        this.combatTriangleMultiplier = this._combatTriangleMultiplier();

        // Yes very ugly, but it figures out if the monster has a passive that reduces player damage reduction
        if(this.dummyMonster.passives.length > 0 && this.dummyMonster.passives
            .some(p => Object.keys(p.modifiers)
            .some(m => m === "decreasedPlayerDamageReduction"))) {

            this.monsterPassiveDecreasedPlayerDamageReduction = 
            this.dummyMonster.passives
            .filter(p => Object.keys(p.modifiers)
            .some(m => m === "decreasedPlayerDamageReduction"))[0]
            .modifiers.decreasedPlayerDamageReduction;
        } else {
            this.monsterPassiveDecreasedPlayerDamageReduction = 0;
        }

        // TODO: Stun passive

        if(monsterArea && monsterArea.areaEffect) {
            if(monsterArea.areaEffect.modifier === "increasedDamageTakenPerAttack") {
                this.damageTakenPerAttackEffect = this.monsterArea.areaEffect.magnitude;
                this.effectiveDamageTakenPerAttackEffect = this._slayerNegationForAreaEffect(this.damageTakenPerAttackEffect);
                this.damageTakenPerAttack = Math.floor((this.dummyPlayer.stats.maxHitpoints * this.damageTakenPerAttackEffect) / 100);
                this.effectiveDamageTakenPerAttack = Math.floor((this.dummyPlayer.stats.maxHitpoints * this.effectiveDamageTakenPerAttackEffect) / 100);
            } else {
                this.damageTakenPerAttackEffect = 0;
                this.effectiveDamageTakenPerAttackEffect = 0;
                this.damageTakenPerAttack = 0;
                this.effectiveDamageTakenPerAttack = 0;
            }
        } else {
            this.damageTakenPerAttackEffect = 0;
            this.effectiveDamageTakenPerAttackEffect = 0;
            this.damageTakenPerAttack = 0;
            this.effectiveDamageTakenPerAttack = 0;
        }
        
        this.dummyEnemy.availableAttacks.forEach(specialAttack => {

            this.specialAttackChanceTotal += specialAttack.chance;

            let canStun = false;
            let canSleep = false;

            // When you are stunned, monsters hit for 30% more
            // We're calculating the worst-case-scenario, so if a monster can stun with any attack,
            // we assume that the 30% always applies
            if(specialAttack.attack.onhitEffects.some((e) => e.type === "Stun") ||
            specialAttack.attack.prehitEffects.some((e) => e.type === "Stun")) {
                canStun = true;
                this.canStun = true;
                this.stunDamageMultiplier = 1.3;
            }

            // When you are sleeping, monsters hit for 20% more
            // We're calculating the worst-case-scenario, so if a monster can sleep with any attack,
            // we assume that the 20% always applies
            if(specialAttack.attack.onhitEffects.some((e) => e.type === "Sleep") ||
            specialAttack.attack.prehitEffects.some((e) => e.type === "Sleep")) {
                canSleep = true;
                this.canSleep = true;
                this.sleepDamageMultiplier = 1.2;
            }

            this.specialAttacks.push({
                specialAttackName: specialAttack.attack.name,
                canStun,
                canSleep,
                originalSpecialAttack: specialAttack.attack
            });
        });

        if(this.monsterId === "melvorTotH:VorloranProtector") {
            this.canStun = true;
            this.stunDamageMultiplier = 1.3;
        }

        if(this.canStun || this.canSleep) {
            this.conditionDamageMultiplier = Math.max(this.stunDamageMultiplier, this.sleepDamageMultiplier);
        }

        // Enemy cannot normal attack, if it will always use some special attack and none of them can normal attack
        if(this.specialAttackChanceTotal >= 100 && 
            this.dummyEnemy.availableAttacks.every(a => a.attack.canNormalAttack === false && 
            a.attack.description.toLowerCase().indexOf('normal attack') === -1)
        ) {
            this.canNormalAttack = false;
        } else {
            this.canNormalAttack = true;
        }

        // Fetch certain monster specific modifier bullshit
        const {
            increasedMaxHitPercentModifier,
            increasedMaxHitFlatModifier,
            decreasedMaxHitpointsModifier,
            decreasedDamageReductionModifier
        } = WidMonsterUtil.getMonsterSpecificBullshit(this.monsterId, this.afflictionFactor);

        this.increasedMaxHitPercentModifier = increasedMaxHitPercentModifier;
        this.increasedMaxHitFlatModifier = increasedMaxHitFlatModifier;
        this.decreasedMaxHitpointsModifier = decreasedMaxHitpointsModifier;
        this.decreasedDamageReductionModifier = decreasedDamageReductionModifier;


        this.normalAttackMaxHit = this._calculateStandardMaxHit()

        const dmgs = (this.normalAttackMaxHit + increasedMaxHitFlatModifier) * this.conditionDamageMultiplier * this.safetyFactor * increasedMaxHitPercentModifier;

        const pred = this._playerDamageReduction - this.monsterPassiveDecreasedPlayerDamageReduction - decreasedDamageReductionModifier < 0 ? 0 
                    : this._playerDamageReduction - this.monsterPassiveDecreasedPlayerDamageReduction - decreasedDamageReductionModifier;

        const reds = 1 - (Math.floor(pred * this.combatTriangleMultiplier) / 100);
        this.effectiveNormalAttackMaxHit = Math.round(dmgs * reds);

        this.specialAttacks = this.specialAttacks.map(specialAttack => {
            const maxHit = this._specialAttackDamage(specialAttack.originalSpecialAttack);

            const dmgs = (maxHit + increasedMaxHitFlatModifier) * this.conditionDamageMultiplier * this.safetyFactor * increasedMaxHitPercentModifier;

            const pred = this._playerDamageReduction - this.monsterPassiveDecreasedPlayerDamageReduction - decreasedDamageReductionModifier < 0 ? 0 
                        : this._playerDamageReduction - this.monsterPassiveDecreasedPlayerDamageReduction - decreasedDamageReductionModifier;

            const reds = 1 - (Math.floor(pred * this.combatTriangleMultiplier) / 100);
            const effectiveMaxHit = Math.round(dmgs * reds);
            
            return {
                ...specialAttack,
                maxHit,
                effectiveMaxHit
            }
        });

        let specialAttackMaxHit = 0;
        let maxHittingSpecialAttack = null;
        let effectiveSpecialAttackMaxHit = 0;
        let effectiveMaxHittingSpecialAttack = null;

        this.specialAttacks.forEach(specialAttack => { 
            if(specialAttack.maxHit > specialAttackMaxHit) {
                specialAttackMaxHit = specialAttack.maxHit;
                maxHittingSpecialAttack = specialAttack;
            }

            if(specialAttack.effectiveMaxHit > effectiveSpecialAttackMaxHit) {
                effectiveSpecialAttackMaxHit = specialAttack.effectiveMaxHit;
                effectiveMaxHittingSpecialAttack = specialAttack;
            }
        });

        this.specialAttackMaxHit = specialAttackMaxHit;
        this.maxHittingSpecialAttack = maxHittingSpecialAttack;
        this.effectiveSpecialAttackMaxHit = effectiveSpecialAttackMaxHit;
        this.effectiveMaxHittingSpecialAttack = effectiveMaxHittingSpecialAttack;

        if(this.canNormalAttack) {
            this.maxHit = Math.max(this.normalAttackMaxHit, this.specialAttackMaxHit);
            this.effectiveMaxHit = Math.max(this.effectiveNormalAttackMaxHit, this.effectiveSpecialAttackMaxHit);
        } else {
            this.maxHit = this.specialAttackMaxHit;
            this.effectiveMaxHit = this.effectiveSpecialAttackMaxHit;
        }

    }

    whatMakesMeDangerous() {
        let explain = {
            monsterName: this.name,
            affliction: {
                canAfflict: this.decreasedMaxHitpointsModifier < 1,
                afflictionFactor: this.afflictionFactor,
                afflictionEffect: this.decreasedMaxHitpointsModifier
            }
        };

        if(this.canNormalAttack && (this.normalAttackMaxHit > this.specialAttackMaxHit)) {
            explain.bestAttackName = "Normal Attack";
            explain.maxHit = this.normalAttackMaxHit;
            explain.effectiveMaxHit = this.effectiveNormalAttackMaxHit;
            explain.attackStyle = this.attackStyle;

            const [equation, vars] = WidMonsterUtil.maxHitEquationHTML(
                this.monsterId,
                this.afflictionFactor,
                this.normalAttackMaxHit, 
                this.conditionDamageMultiplier, 
                this.safetyFactor, 
                this.monsterPassiveDecreasedPlayerDamageReduction, 
                this._playerDamageReduction, 
                this.combatTriangleMultiplier
            );

            explain.equation = equation;
            explain.vars = vars;
        } else {
            explain.bestAttackName = this.maxHittingSpecialAttack.specialAttackName;
            explain.maxHit = this.specialAttackMaxHit;
            explain.effectiveMaxHit = this.effectiveSpecialAttackMaxHit;
            //explain.attackStyle = this.maxHittingSpecialAttack.originalSpecialAttack.attackStyle;
            explain.attackStyle = this.attackStyle;

            const [equation, vars] = WidMonsterUtil.maxHitEquationHTML(
                this.monsterId,
                this.afflictionFactor,
                this.specialAttackMaxHit, 
                this.conditionDamageMultiplier, 
                this.safetyFactor, 
                this.monsterPassiveDecreasedPlayerDamageReduction, 
                this._playerDamageReduction, 
                this.combatTriangleMultiplier
            );

            explain.equation = equation;
            explain.vars = vars;
        }

        return explain;
    }

    getValues() {
        return {
            name: this.name,
            monsterId: this.monsterId,
            canNormalAttack: this.canNormalAttack,
            attackStyle: this.attackStyle,
            canStun: this.canStun,
            canSleep: this.canSleep,
            stunDamageMultiplier: this.stunDamageMultiplier,
            sleepDamageMultiplier: this.sleepDamageMultiplier,
            conditionDamageMultiplier: this.conditionDamageMultiplier,

            damageTakenPerAttackEffect: this.damageTakenPerAttackEffect,
            damageTakenPerAttack: this.damageTakenPerAttack,
            effectiveDamageTakenPerAttack: this.effectiveDamageTakenPerAttack,
            monsterPassiveDecreasedPlayerDamageReduction: this.monsterPassiveDecreasedPlayerDamageReduction,

            combatTriangleMultiplier: this.combatTriangleMultiplier,

            specialAttackChanceTotal: this.specialAttackChanceTotal,

            normalAttackMaxHit: this.normalAttackMaxHit,
            effectiveNormalAttackMaxHit: this.effectiveNormalAttackMaxHit,

            specialAttackMaxHit: this.specialAttackMaxHit,
            effectiveSpecialAttackMaxHit: this.effectiveSpecialAttackMaxHit,
            maxHittingSpecialAttack: this.maxHittingSpecialAttack.specialAttackName,
            effectiveMaxHittingSpecialAttack: this.effectiveMaxHittingSpecialAttack.specialAttackName,

            maxHit: this.maxHit,
            effectiveMaxHit: this.effectiveMaxHit,

            increasedMaxHitPercentModifier: this.increasedMaxHitPercentModifier,
            increasedMaxHitFlatModifier: this.increasedMaxHitFlatModifier,
            decreasedMaxHitpointsModifier: this.decreasedMaxHitpointsModifier,
            decreasedDamageReductionModifier: this.decreasedDamageReductionModifier
        };
    }

    _computeStandardDamageReduction() {
        let reduction = this.dummyPlayer.equipmentStats.damageReduction;
        reduction += this.dummyPlayer.modifiers.getFlatDamageReductionModifier();
        reduction *= 1 + (this.dummyPlayer.modifiers.increasedDamageReductionPercent - this.dummyPlayer.modifiers.decreasedDamageReductionPercent) / 100;

        if (this.dummyPlayer.modifiers.halveDamageReduction > 0)
            reduction *= 0.5;

        reduction = Math.floor(reduction);
        return WidMonsterUtil.clampValue(reduction, 0, 95);
    }

    _slayerNegationForAreaEffect(effect) {
        const effectValue = effect - 
        this.dummyPlayer.modifiers.increasedSlayerAreaEffectNegationFlat + 
        this.dummyPlayer.modifiers.decreasedSlayerAreaEffectNegationFlat;

        return Math.max(effectValue, 0);
    }

    _specialAttackDamage(attack) {
        let calcDamage = 0;

        attack.damage.forEach((damage)=>{
            const dmg = this._getMaxDamage(damage);

            if(attack.id === "melvorF:SavageSpike") {
                calcDamage += dmg;
            } else {
                if(dmg > calcDamage)
                    calcDamage = dmg;
            }
        });
        
        return calcDamage;
    }

    _getMaxDamage(damage) {
        let character;

        switch (damage.character) {
            // Monster
            case 'Attacker':
                character = this._getCharacter('monster');
                break;
            // Player
            case 'Target':
                character = this._getCharacter('player');;
                break;
            default:
                throw new Error(`Invalid damage character type: damage.character}`);
        }
        return WidMonsterUtil.damageRoll(character, damage.maxRoll, damage.maxPercent);
    }

    _getCharacter(monsterOrPlayer) {
        if(monsterOrPlayer === 'monster') {
            return {
                maxHitpoints: this.dummyEnemy.stats.maxHitpoints,
                maxHit: this.normalAttackMaxHit,
                levels: this.dummyEnemy.levels,
                damageReduction: this.dummyEnemy.stats.damageReduction || 0,
                hitpointsPercent: 100,
            };
        } else if(monsterOrPlayer === 'player') {
            return {
                maxHitpoints: this.dummyPlayer.stats.maxHitpoints,
                maxHit: this.dummyPlayer.stats.maxHit,
                levels: this.dummyPlayer.levels,
                damageReduction: this._playerDamageReduction,
                hitpointsPercent: 100,
            };
        } else {
            throw new Error(`Invalid character type: ${monsterOrPlayer}`);
        }
    }

    _combatTriangleMultiplier() {
        const reductions = this.gameClone.currentGamemode.combatTriangle.reductionModifier;
        return reductions[this._playerAttackStyle][this.attackStyle];
    }

    _calculateStandardMaxHit() {
        let maxHit;
        let effectiveLevel;
        let equipmentbonus;

        switch (this.attackStyle) 
        {
            case 'magic':
                let _a;
                if (this.dummyEnemy.spellSelection.ancient !== undefined) {
                    return numberMultiplier * this.dummyEnemy.spellSelection.ancient.specialAttack.damage[0].maxPercent;
                }
                const spell = (_a = this.dummyEnemy.spellSelection.standard) !== null && _a !== void 0 ? _a : this.dummyEnemy.spellSelection.archaic;
                if (spell !== undefined) {
                    maxHit = Math.floor(numberMultiplier * spell.maxHit * (1 + this.dummyEnemy.equipmentStats.magicDamageBonus / 100) * (1 + (this.dummyMonster.levels.Magic + 1) / 200));
                }
                else {
                    maxHit = 0;
                }
                break;
            case 'ranged':
                effectiveLevel = this.dummyMonster.levels.Ranged + 9;
                equipmentbonus = this.dummyEnemy.equipmentStats.rangedStrengthBonus;
                maxHit = Math.floor(numberMultiplier * (1.3 + effectiveLevel / 10 + equipmentbonus / 80 + (effectiveLevel * equipmentbonus) / 640));
                break;
            case 'melee':
                effectiveLevel = this.dummyMonster.levels.Strength + 9;
                equipmentbonus = this.dummyEnemy.equipmentStats.meleeStrengthBonus;
                maxHit = Math.floor(numberMultiplier * (1.3 + effectiveLevel / 10 + equipmentbonus / 80 + (effectiveLevel * equipmentbonus) / 640));
                break;
            default:
                throw new Error();
        }

        return maxHit;
    }
}