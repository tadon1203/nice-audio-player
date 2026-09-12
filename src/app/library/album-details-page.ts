import { Component, computed, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideArrowLeft } from '@lucide/angular';
import { map } from 'rxjs';
import type { LibraryAlbumKey, LibraryAlbumTrackSummary } from '@shared/native-app-api';
import { Button } from '@app/ui/button';
import { Artwork } from '@app/ui/artwork';
import { FormatDurationPipe } from '@app/ui/format-duration';
import { PageFrame } from '@app/ui/page-frame';
import { PlaybackSession } from '@app/playback/playback-session';
import { ScrollRegion } from '@app/ui/scroll-region';
import { AlbumDetailsWorkspace } from './album-details-workspace';
import {
	albumTrackTableColumns,
	TrackTable,
	type TrackTableRow,
	type TrackTablePlaybackStatus
} from './track-table';

@Component({
	selector: 'app-album-details-page',
	imports: [
		Artwork,
		Button,
		FormatDurationPipe,
		LucideArrowLeft,
		PageFrame,
		RouterLink,
		ScrollRegion,
		TrackTable
	],
	providers: [AlbumDetailsWorkspace],
	host: {
		class: 'block h-full min-h-0 min-w-0 overflow-hidden',
		'data-page': 'album-details'
	},
	templateUrl: './album-details-page.html'
})
export class AlbumDetailsPage {
	protected readonly trackTableColumns = albumTrackTableColumns;
	private readonly route = inject(ActivatedRoute);
	private readonly destroyRef = inject(DestroyRef);
	protected readonly workspace = inject(AlbumDetailsWorkspace);
	protected readonly playback = inject(PlaybackSession);
	protected readonly albumKey = toSignal(
		this.route.paramMap.pipe(
			map((params): LibraryAlbumKey | null => {
				const title = params.get('albumTitle');
				const albumArtist = params.get('albumArtist');
				return title && albumArtist ? { title, albumArtist } : null;
			})
		),
		{ initialValue: this.readAlbumKey() }
	);
	protected readonly details = this.workspace.details;
	protected readonly tracks = computed<readonly TrackTableRow[]>(() =>
		this.workspace
			.tracks()
			.map((track) => trackRowFromAlbumTrack(track, this.albumKey()?.title ?? 'Unknown album'))
	);
	protected readonly activeTrackId = computed(() => this.playback.currentTrack()?.id ?? null);
	protected readonly playbackStatus = computed<TrackTablePlaybackStatus>(
		() => this.playback.snapshot()?.status ?? 'stopped'
	);

	constructor() {
		this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
			const key = this.albumKey();
			if (key) void this.workspace.ensureLoaded(key);
		});
	}

	playAlbum(): void {
		const key = this.albumKey();
		if (key) void this.playback.startLibraryAlbum(key);
	}

	playTrack(id: string): void {
		void this.playback.startLibraryTrack(id);
	}

	private readAlbumKey(): LibraryAlbumKey | null {
		const title = this.route.snapshot.paramMap.get('albumTitle');
		const albumArtist = this.route.snapshot.paramMap.get('albumArtist');
		return title && albumArtist ? { title, albumArtist } : null;
	}
}

const trackRowFromAlbumTrack = (track: LibraryAlbumTrackSummary, album: string): TrackTableRow => ({
	id: track.id,
	title: track.title,
	artist: track.artist,
	album,
	trackNumber: track.trackNumber,
	discNumber: track.discNumber,
	format: track.fileFormat,
	quality: qualityLabel(track.bitDepth, track.sampleRate),
	durationMs: track.durationMs,
	availability: track.availability,
	playable: track.playable
});

const qualityLabel = (bitDepth: number | null, sampleRate: number | null): string | null => {
	const values = [
		bitDepth === null ? null : `${bitDepth} bit`,
		sampleRate === null ? null : `${sampleRate / 1000} kHz`
	].filter((value): value is string => value !== null);
	return values.length > 0 ? values.join(' · ') : null;
};
