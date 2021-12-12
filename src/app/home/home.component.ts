import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ElectronService } from '../core/services';
import { PDFDocument } from '../libs/pdf/document';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {
  constructor(
    private _router: Router,
    private readonly _electronService: ElectronService
  ) {}

  ngOnInit(): void {
    console.log('HomeComponent INIT');
  }

  fileChanged($event: Event) {
    console.log('File:', ($event.target as any).files[0].path);

    if (!($event.target as any).files[0]) {
      return;
    }

    const doc = new PDFDocument();
  }
}
