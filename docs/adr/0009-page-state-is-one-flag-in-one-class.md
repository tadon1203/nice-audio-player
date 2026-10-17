# 0009: The shell's page state is one flag, read and written in one class

`App.PageState` has one field, `nowPlaying`, and only `NowPlayingView` reads or writes `page.state`. Now Playing opens with `goto(page.url, { shallow: true, state, persistState: true })`, so Back closes it and a reload keeps it open. The deprecated `pushState` and `replaceState` are not used.

What a link tells the page it opens (the album's artwork) is not in page state. The album page reads it from the query cache by ID, because it is a function of the album, not of how the listener got there.

Reason: Now Playing is a layer over the current location, not a page, and Back must close it. Shallow routing is SvelteKit's mechanism for that. The state is not in the URL, because it is not a location: the URL would need merging with the page's own query and every change would be a real navigation (`load` reruns and scroll memory runs). `persistState` fixes the loss of page state on a hard reload.

Cost: `page.state` is empty after `invalidateAll`, so the app uses `refreshAll`. The class keeps a `#pushed` flag to tell its own history entry from one reached by a reload.
