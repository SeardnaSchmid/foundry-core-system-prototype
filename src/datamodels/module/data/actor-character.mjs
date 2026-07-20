import TnoActorBase from "./base-actor.mjs";

export default class TnoCharacter extends TnoActorBase {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    // Iterate over ability names and create a new SchemaField for each.
    // `base` is the trained/leveled rating; `value` is the current,
    // damage-adjusted rating that rolls actually use.
    schema.abilities = new fields.SchemaField(Object.keys(CONFIG.TNO.abilities).reduce((obj, ability) => {
      obj[ability] = new fields.SchemaField({
        base: new fields.NumberField({ ...requiredInteger, initial: 4, min: 0 }),
        value: new fields.NumberField({ ...requiredInteger, initial: 4, min: 0 }),
      });
      return obj;
    }, {}));

    return schema;
  }

  prepareDerivedData() {
    // Loop through ability scores, and add their modifiers to our sheet output.
    for (const key in this.abilities) {
      // Calculate the modifier using d20 rules.
      this.abilities[key].mod = Math.floor((this.abilities[key].value - 10) / 2);
      // Handle ability label localization.
      this.abilities[key].label = game.i18n.localize(CONFIG.TNO.abilities[key]) ?? key;
    }
  }

  getRollData() {
    const data = {};

    // Copy the ability scores to the top level, so that rolls can use
    // formulas like `@str.mod + 4`.
    if (this.abilities) {
      for (let [k,v] of Object.entries(this.abilities)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }

    return data
  }
}