import { Dependency, DirtyLevels, IEffect, Subscriber } from './system.js';

export function effect(fn: () => void) {
	const e = new Effect(fn);
	e.run();
	return e;
}

export class Effect implements IEffect, Dependency, Subscriber {
	nextNotify = undefined;

	// Dependency
	subs = undefined;
	subsTail = undefined;
	weakRef = undefined;
	subsCount = 0;
	subVersion = -1;

	// Subscriber
	deps = undefined;
	depsTail = undefined;
	versionOrDirtyLevel = DirtyLevels.Dirty;

	constructor(
		private fn: () => void
	) {
		if (!Dependency.linkDependencySubscriber(this)) {
			Dependency.linkEffectSubscriber(this);
		}
	}

	notify() {
		const dirtyLevel = this.versionOrDirtyLevel;
		if (dirtyLevel === DirtyLevels.SideEffectsOnly) {
			this.versionOrDirtyLevel = DirtyLevels.None;
			Subscriber.runInnerEffects(this);
		} else {
			if (dirtyLevel === DirtyLevels.MaybeDirty) {
				Subscriber.resolveMaybeDirty(this);
			}
			if (this.versionOrDirtyLevel === DirtyLevels.Dirty) {
				this.run();
			} else {
				Subscriber.runInnerEffects(this);
			}
		}
	}

	run() {
		const prevSub = Subscriber.startTrackDependencies(this);
		this.fn();
		Subscriber.endTrackDependencies(this, prevSub);
	}
}
