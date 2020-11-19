import {Link} from "./link";


export class Metadata {
  uuid: string;
  value: any;
  name: string;
  associationIds: string[];
  _links: Link;
}
