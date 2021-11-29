import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {ElectronService} from '../core/services';
import {PNG} from '../pdf/image/lib/png-js/png';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  constructor(private router: Router, private readonly electronService: ElectronService) { }

  ngOnInit(): void {
    console.log('HomeComponent INIT');
  }

    fileChanged($event: Event) {
    console.log("File:", ($event.target as any).files[0].path)

      if(!($event.target as any).files[0]){
        return;
      }

      const canvas = document.getElementById('canvasElement') as HTMLCanvasElement;

      //PNG.load('assets/Screenshot from 2021-06-06 20-08-22.png', canvas)


      this.electronService.fs.readFile(($event.target as any).files[0].path, (err, data) => {
        const png = new PNG(data);
        if (typeof (canvas && canvas.getContext) === 'function') {
          png.render(canvas as any);
        }
      })
    }
}
