import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export function LibraryPresentationTabs() {
  return (
    <TabsList variant="line" activateOnFocus={false}>
      <TabsTrigger value="albums">Albums</TabsTrigger>
      <TabsTrigger value="albumArtists">Album Artists</TabsTrigger>
      <TabsTrigger value="tracks">Tracks</TabsTrigger>
    </TabsList>
  );
}
