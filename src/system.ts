export interface IEffect {
	nextNotify: IEffect | undefined;
	notify(): void;
}

export interface Dependency {
	subs: Link | undefined;
	subsTail: Link | undefined;
	subsCount: number;
	subVersion: number;
	update?(): void;
}

export interface Subscriber {
	/**
	 * Represents either the version or the dirty level of the dependency.
	 * 
	 * - When tracking is active, this property holds the version number.
	 * - When tracking is not active, this property holds the dirty level.
	 */
	versionOrDirtyLevel: number | DirtyLevels;
	deps: Link | undefined;
	depsTail: Link | undefined;
	weakRef: WeakRef<Subscriber> | undefined;
}

export interface Link {
	dep: Dependency;
	sub: (Subscriber & ({} | IEffect | Dependency)) | WeakRef<Subscriber>;
	prevSubOrUpdate: Link | undefined;
	nextSub: Link | undefined;
	nextDep: Link | undefined;
	queuedPropagateOrNextReleased: Link | undefined;
}

export const enum DirtyLevels {
	None,
	SideEffectsOnly,
	MaybeDirty,
	Dirty,
}

export namespace System {

	export let activeSub: Subscriber | undefined = undefined;
	export let activeEffectScope: Subscriber | undefined = undefined;
	export let activeSubsDepth = 0;
	export let activeEffectScopesDepth = 0;
	export let batchDepth = 0;
	export let lastSubVersion = DirtyLevels.Dirty + 1;
	export let queuedEffects: IEffect | undefined = undefined;
	export let queuedEffectsTail: IEffect | undefined = undefined;

	export function startBatch() {
		batchDepth++;
	}

	export function endBatch() {
		batchDepth--;
		while (batchDepth === 0 && queuedEffects !== undefined) {
			const effect = queuedEffects;
			const queuedNext = queuedEffects.nextNotify;
			if (queuedNext !== undefined) {
				queuedEffects.nextNotify = undefined;
				queuedEffects = queuedNext;
			} else {
				queuedEffects = undefined;
				queuedEffectsTail = undefined;
			}
			effect.notify();
		}
	}
}

export namespace Link {

	export let pool: Link | undefined = undefined;

	export function get(dep: Dependency, sub: Subscriber): Link {
		if (pool !== undefined) {
			const link = pool;
			pool = link.queuedPropagateOrNextReleased;
			link.queuedPropagateOrNextReleased = undefined;
			link.dep = dep;
			link.sub = sub;
			return link;
		} else {
			return {
				dep,
				sub,
				prevSubOrUpdate: undefined,
				nextSub: undefined,
				nextDep: undefined,
				queuedPropagateOrNextReleased: undefined,
			};
		}
	}
}

export namespace Dependency {

	const system = System;

	export let propagate = fastPropagate;

	// export function setPropagationMode(mode: 'strict' | 'fast') {
	// 	propagate = mode === 'strict' ? strictPropagate : fastPropagate;
	// }

	export function linkDependencySubscriber(dep: Dependency) {
		if (system.activeSubsDepth === 0) {
			return false;
		}
		const sub = system.activeSub!;
		const subVersion = sub.versionOrDirtyLevel;
		if (dep.subVersion === subVersion) {
			return true;
		}
		dep.subVersion = subVersion;

		const depsTail = sub.depsTail;
		const old = depsTail !== undefined
			? depsTail.nextDep
			: sub.deps;

		if (old === undefined || old.dep !== dep) {
			const newLink = Link.get(dep, sub);
			if (old !== undefined) {
				newLink.nextDep = old;
			}
			if (depsTail === undefined) {
				sub.depsTail = sub.deps = newLink;
			} else {
				sub.depsTail = depsTail.nextDep = newLink;
			}
			if (dep.subs === undefined) {
				dep.subs = newLink;
				dep.subsTail = newLink;
			} else {
				const oldTail = dep.subsTail!;
				newLink.prevSubOrUpdate = oldTail;
				oldTail.nextSub = newLink;
				dep.subsTail = newLink;
			}
		} else {
			sub.depsTail = old;
		}
		dep.subsCount++;

		return true;
	}

	export function linkEffectSubscriber(dep: Dependency) {
		if (system.activeEffectScopesDepth === 0) {
			return false;
		}
		const sub = system.activeEffectScope!;
		const subVersion = sub.versionOrDirtyLevel;
		if (dep.subVersion === subVersion) {
			return true;
		}
		dep.subVersion = subVersion;

		const depsTail = sub.depsTail;
		const old = depsTail !== undefined
			? depsTail.nextDep
			: sub.deps;

		if (old === undefined || old.dep !== dep) {
			const newLink = Link.get(dep, sub);
			if (old !== undefined) {
				newLink.nextDep = old;
			}
			if (depsTail === undefined) {
				sub.depsTail = sub.deps = newLink;
			} else {
				sub.depsTail = depsTail.nextDep = newLink;
			}
			if (dep.subs === undefined) {
				dep.subs = newLink;
				dep.subsTail = newLink;
			} else {
				const oldTail = dep.subsTail!;
				newLink.prevSubOrUpdate = oldTail;
				oldTail.nextSub = newLink;
				dep.subsTail = newLink;
			}
		} else {
			sub.depsTail = old;
		}
		dep.subsCount++;

		return true;
	}

	// export function strictPropagate(dep: Dependency) {
	// 	let depIsEffect = false;
	// 	let link = dep.subs;
	// 	let dirtyLevel = DirtyLevels.Dirty;
	// 	let depth = 0;

	// 	top: do {
	// 		while (link !== undefined) {
	// 			const sub = link.sub.deref();
	// 			const subDirtyLevel = sub.versionOrDirtyLevel;

	// 			if (subDirtyLevel < dirtyLevel) {
	// 				sub.versionOrDirtyLevel = dirtyLevel;
	// 			}

	// 			if (subDirtyLevel === DirtyLevels.None) {
	// 				const subIsEffect = 'notify' in sub;

	// 				if ('subs' in sub && sub.subs !== undefined) {
	// 					sub.deps!.queuedPropagateOrNextReleased = link;
	// 					dep = sub;
	// 					depIsEffect = subIsEffect;
	// 					link = sub.subs;
	// 					if (subIsEffect) {
	// 						dirtyLevel = DirtyLevels.SideEffectsOnly;
	// 					} else {
	// 						dirtyLevel = DirtyLevels.MaybeDirty;
	// 					}
	// 					depth++;

	// 					continue top;
	// 				} else if (subIsEffect) {
	// 					const queuedEffectsTail = system.queuedEffectsTail;

	// 					if (queuedEffectsTail !== undefined) {
	// 						queuedEffectsTail.nextNotify = sub;
	// 						system.queuedEffectsTail = sub;
	// 					} else {
	// 						system.queuedEffectsTail = sub;
	// 						system.queuedEffects = sub;
	// 					}
	// 				}
	// 			}

	// 			link = link.nextSub;
	// 		}

	// 		const depDeps = (dep as Dependency & Subscriber).deps;
	// 		if (depDeps !== undefined) {

	// 			const prevLink = depDeps.queuedPropagateOrNextReleased;

	// 			if (prevLink !== undefined) {
	// 				depDeps.queuedPropagateOrNextReleased = undefined;
	// 				dep = prevLink.dep;
	// 				depIsEffect = 'notify' in dep;
	// 				link = prevLink.nextSub;
	// 				depth--;

	// 				if (depth === 0) {
	// 					dirtyLevel = DirtyLevels.Dirty;
	// 				} else if (depIsEffect) {
	// 					dirtyLevel = DirtyLevels.SideEffectsOnly;
	// 				} else {
	// 					dirtyLevel = DirtyLevels.MaybeDirty;
	// 				}

	// 				const prevSub = prevLink.sub;

	// 				if ('notify' in prevSub) {
	// 					const queuedEffectsTail = system.queuedEffectsTail;

	// 					if (queuedEffectsTail !== undefined) {
	// 						queuedEffectsTail.nextNotify = prevSub;
	// 						system.queuedEffectsTail = prevSub;
	// 					} else {
	// 						system.queuedEffectsTail = prevSub;
	// 						system.queuedEffects = prevSub;
	// 					}
	// 				}

	// 				continue;
	// 			}
	// 		}

	// 		break;
	// 	} while (true);
	// }

	/**
	 * @example Original
		export function fastPropagate(dep: Dependency, dirtyLevel = DirtyLevels.Dirty) {
			let link = dep.subs;

			while (link !== undefined) {
				const sub = link.sub;
				const subDirtyLevel = sub.versionOrDirtyLevel;

				if (subDirtyLevel < dirtyLevel) {
					sub.versionOrDirtyLevel = dirtyLevel;
				}

				if (subDirtyLevel === DirtyLevels.None) {
					if ('notify' in sub) {
						const queuedEffectsTail = system.queuedEffectsTail;

						if (queuedEffectsTail !== undefined) {
							queuedEffectsTail.nextNotify = sub;
							system.queuedEffectsTail = sub;
						} else {
							system.queuedEffectsTail = sub;
							system.queuedEffects = sub;
						}
					} else if ('subs' in sub) {
						fastPropagate(sub, DirtyLevels.MaybeDirty);
					}
				}

				link = link.nextSub;
			}
		}
	 */
	export function fastPropagate(dep: Dependency) {
		let subsHead = dep.subs!;
		if (subsHead === undefined) {
			return;
		}

		let dirtyLevel = DirtyLevels.Dirty;
		let lastSubs = subsHead;
		let link = subsHead;
		let remainingQuantity = 0;

		do {
			const sub = 'deref' in link.sub
				? link.sub.deref() as Subscriber & ({} | Dependency | IEffect)
				: link.sub;
			let nextSub = link.nextSub;

			if (sub !== undefined) {
				const subDirtyLevel = sub.versionOrDirtyLevel;

				if (subDirtyLevel < dirtyLevel) {
					sub.versionOrDirtyLevel = dirtyLevel;
				}

				if (subDirtyLevel === DirtyLevels.None) {

					if ('notify' in sub) {
						const queuedEffectsTail = system.queuedEffectsTail;

						if (queuedEffectsTail !== undefined) {
							queuedEffectsTail.nextNotify = sub;
							system.queuedEffectsTail = sub;
						} else {
							system.queuedEffectsTail = sub;
							system.queuedEffects = sub;
						}
					} else if ('subs' in sub) {
						const subSubs = sub.subs;

						if (subSubs !== undefined) {
							lastSubs.queuedPropagateOrNextReleased = subSubs;
							lastSubs = subSubs;
							remainingQuantity++;
						}
					}
				}
			} else {
				nextSub = link.nextSub;
				const prevSub = link.prevSubOrUpdate;

				if (nextSub !== undefined) {
					nextSub.prevSubOrUpdate = prevSub;
				}
				if (prevSub !== undefined) {
					prevSub.nextSub = nextSub;
				}

				if (nextSub === undefined) {
					link.dep.subsTail = prevSub;
				}
				if (prevSub === undefined) {
					link.dep.subs = nextSub;
				}

				// @ts-ignore
				link.dep = undefined;
				// @ts-ignore
				link.sub = undefined;
				link.prevSubOrUpdate = undefined;
				link.nextSub = undefined;
				link.nextDep = undefined;

				link.queuedPropagateOrNextReleased = Link.pool;
				Link.pool = link;
			}

			if (nextSub === undefined) {
				if (remainingQuantity > 0) {
					const nextPropagate = subsHead.queuedPropagateOrNextReleased!;
					subsHead.queuedPropagateOrNextReleased = undefined;
					subsHead = nextPropagate;
					link = subsHead;

					dirtyLevel = DirtyLevels.MaybeDirty;
					remainingQuantity--;
					continue;
				}
				break;
			}

			link = nextSub;
		} while (true);
	}
}

export namespace Subscriber {

	const system = System;

	export function runInnerEffects(sub: Subscriber) {
		let link = sub.deps as Link | undefined;
		while (link !== undefined) {
			const dep = link.dep as Dependency | Dependency & IEffect;
			if ('notify' in dep) {
				dep.notify();
			}
			link = link.nextDep;
		}
	}

	export function resolveMaybeDirty(sub: Subscriber, depth = 0) {
		let link = sub.deps;

		while (link !== undefined) {
			const dep = link.dep as Dependency | Dependency & Subscriber;
			if ('deps' in dep) {
				const dirtyLevel = dep.versionOrDirtyLevel;

				if (dirtyLevel === DirtyLevels.MaybeDirty) {
					if (depth >= 4) {
						resolveMaybeDirtyNonRecursive(dep);
					} else {
						resolveMaybeDirty(dep, depth + 1);
					}
					if (dep.versionOrDirtyLevel === DirtyLevels.Dirty) {
						dep.update!();
						if ((sub.versionOrDirtyLevel as DirtyLevels) === DirtyLevels.Dirty) {
							break;
						}
					}
				} else if (dirtyLevel === DirtyLevels.Dirty && 'update' in dep) {
					dep.update!();
					if ((sub.versionOrDirtyLevel as DirtyLevels) === DirtyLevels.Dirty) {
						break;
					}
				}
			}
			link = link.nextDep;
		}

		if (sub.versionOrDirtyLevel === DirtyLevels.MaybeDirty) {
			sub.versionOrDirtyLevel = DirtyLevels.None;
		}
	}

	export function resolveMaybeDirtyNonRecursive(sub: Subscriber) {
		let link = sub.deps;
		let remaining = 0;

		do {
			if (link !== undefined) {
				const dep = link.dep as Dependency | Dependency & Subscriber;

				if ('deps' in dep) {
					const depDirtyLevel = dep.versionOrDirtyLevel;

					if (depDirtyLevel === DirtyLevels.MaybeDirty) {
						dep.subs!.prevSubOrUpdate = link;
						sub = dep;
						link = dep.deps;
						remaining++;

						continue;
					} else if (depDirtyLevel === DirtyLevels.Dirty && 'update' in dep) {
						dep.update!();

						if ((sub.versionOrDirtyLevel as DirtyLevels) === DirtyLevels.Dirty) {
							if (remaining > 0) {
								const subSubs = (sub as Dependency & Subscriber).subs!;
								const prevLink = subSubs.prevSubOrUpdate!;
								(sub as Dependency & Subscriber).update!();
								subSubs.prevSubOrUpdate = undefined;
								sub = 'deref' in prevLink.sub ? prevLink.sub.deref()! : prevLink.sub;
								link = prevLink.nextDep;
								remaining--;
								continue;
							}

							break;
						}
					}
				}

				link = link.nextDep;
				continue;
			}

			const dirtyLevel = sub.versionOrDirtyLevel;

			if (dirtyLevel === DirtyLevels.MaybeDirty) {
				sub.versionOrDirtyLevel = DirtyLevels.None;
				if (remaining > 0) {
					const subSubs = (sub as Dependency & Subscriber).subs!;
					const prevLink = subSubs.prevSubOrUpdate!;
					subSubs.prevSubOrUpdate = undefined;
					sub = 'deref' in prevLink.sub ? prevLink.sub.deref()! : prevLink.sub;
					link = prevLink.nextDep;
					remaining--;
					continue;
				}
			} else if (remaining > 0) {
				const subSubs = (sub as Dependency & Subscriber).subs!;
				const prevLink = subSubs.prevSubOrUpdate!;
				if (dirtyLevel === DirtyLevels.Dirty) {
					(sub as Dependency & Subscriber).update!();
				}
				subSubs.prevSubOrUpdate = undefined;
				sub = 'deref' in prevLink.sub ? prevLink.sub.deref()! : prevLink.sub;
				link = prevLink.nextDep;
				remaining--;
				continue;
			}

			break;
		} while (true);
	}

	export function startTrackDependencies(sub: Subscriber) {
		const prevSub = system.activeSub;
		system.activeSub = sub;
		system.activeSubsDepth++;

		sub.depsTail = undefined;
		sub.versionOrDirtyLevel = system.lastSubVersion++;

		return prevSub;
	}

	export function endTrackDependencies(sub: Subscriber, prevSub: Subscriber | undefined) {
		system.activeSubsDepth--;
		system.activeSub = prevSub;

		const depsTail = sub.depsTail;
		if (depsTail !== undefined) {
			if (depsTail.nextDep !== undefined) {
				clearTrack(depsTail.nextDep);
				depsTail.nextDep = undefined;
			}
		} else if (sub.deps !== undefined) {
			clearTrack(sub.deps);
			sub.deps = undefined;
		}
		sub.versionOrDirtyLevel = DirtyLevels.None;
	}

	export function clearTrack(link: Link) {
		do {
			const nextDep = link.nextDep;
			const dep = link.dep as Dependency & Subscriber;
			const nextSub = link.nextSub;
			const prevSub = link.prevSubOrUpdate;

			if (nextSub !== undefined) {
				nextSub.prevSubOrUpdate = prevSub;
			}
			if (prevSub !== undefined) {
				prevSub.nextSub = nextSub;
			}

			if (nextSub === undefined) {
				link.dep.subsTail = prevSub;
			}
			if (prevSub === undefined) {
				link.dep.subs = nextSub;
			}
			dep.subsCount--;

			// @ts-ignore
			link.dep = undefined;
			// @ts-ignore
			link.sub = undefined;
			link.prevSubOrUpdate = undefined;
			link.nextSub = undefined;
			link.nextDep = undefined;

			link.queuedPropagateOrNextReleased = Link.pool;
			Link.pool = link;

			link = nextDep!;

			if (dep.subsCount === 0 && dep.deps !== undefined) {
				const isEffect = 'notify' in dep;
				if (isEffect) {
					clearTrack(dep.deps);
					dep.deps = undefined;
					dep.depsTail = undefined;
					dep.versionOrDirtyLevel = DirtyLevels.None;
				} else {
					switchToWeakRef(dep);
				}
			}
		} while (link !== undefined);
	}

	export function switchToWeakRef(dep: Dependency & Subscriber) {
		let link = dep.deps;

		while (link !== undefined) {
			const sub = link.sub;

			if (!('deref' in sub)) {
				sub.weakRef ??= new WeakRef(sub);
				link.sub = sub.weakRef;

				const dep = link.dep as Dependency & Subscriber;
				if (dep.subsCount === 0 && dep.deps !== undefined) {
					const isEffect = 'notify' in dep;
					if (isEffect) {
						clearTrack(dep.deps);
						dep.deps = undefined;
						dep.depsTail = undefined;
						dep.versionOrDirtyLevel = DirtyLevels.None;
					} else {
						switchToWeakRef(dep);
					}
				}
			}

			link = link.nextDep;
		}
	}

	export function startTrackEffects(sub: Subscriber) {
		const prevSub = system.activeEffectScope;
		system.activeEffectScope = sub;
		system.activeEffectScopesDepth++;

		sub.depsTail = undefined;
		sub.versionOrDirtyLevel = system.lastSubVersion++;

		return prevSub;
	}

	export function endTrackEffects(sub: Subscriber, prevSub: Subscriber | undefined) {
		system.activeEffectScopesDepth--;
		system.activeEffectScope = prevSub;

		const depsTail = sub.depsTail;
		if (depsTail !== undefined) {
			if (depsTail.nextDep !== undefined) {
				clearTrack(depsTail.nextDep);
				depsTail.nextDep = undefined;
			}
		} else if (sub.deps !== undefined) {
			clearTrack(sub.deps);
			sub.deps = undefined;
		}
		sub.versionOrDirtyLevel = DirtyLevels.None;
	}
}
