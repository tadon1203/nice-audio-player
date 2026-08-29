import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export function LibraryPresentationTabs() {
  return (
    <TabsList variant="line" activateOnFocus={false} className="library-view__switch">
      <TabsTrigger value="albums">Albums</TabsTrigger>
      <TabsTrigger value="albumArtists">Album Artists</TabsTrigger>
      <TabsTrigger value="tracks">Tracks</TabsTrigger>
    </TabsList>
  );
}
