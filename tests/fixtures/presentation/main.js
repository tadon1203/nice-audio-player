import { mount } from "svelte";
import "../../../src/app.css";
import Fixture from "./fixture.svelte";

mount(Fixture, { target: document.getElementById("app") });
